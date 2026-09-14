import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api-token";
import { processarComandoAgente } from "@/lib/server/agente";
import { encontrarOuCriarConversaPorTelefone, registrarMensagem } from "@/lib/server/conversas";
import { importarExtratoOfx } from "@/lib/server/conciliacao-bancaria";

const bodySchema = z
  .object({
    telefone: z.string().min(8),
    texto: z.string().optional(),
    anexoPdf: z.object({ base64: z.string().min(1), nomeArquivo: z.string().optional() }).optional(),
    anexoImagem: z.object({ base64: z.string().min(1), mimetype: z.string().min(1) }).optional(),
    anexoOfx: z.object({ base64: z.string().min(1), nomeArquivo: z.string().min(1) }).optional(),
    // Qualquer outro tipo de arquivo (não PDF, não imagem, não OFX) — ver
    // enviar_arquivo_whatsapp em lib/server/agente.ts.
    anexoArquivo: z.object({ base64: z.string().min(1), nomeArquivo: z.string().min(1), mimetype: z.string().min(1) }).optional(),
  })
  .refine((d) => (d.texto && d.texto.trim().length > 0) || d.anexoPdf || d.anexoImagem || d.anexoOfx || d.anexoArquivo, {
    message: "Informe texto, anexoPdf, anexoImagem, anexoOfx ou anexoArquivo.",
  });

/**
 * Recebe comando de texto ou PDF vindo do WhatsApp (já autorizado pelo
 * whatsapp-service — ver relay-comando-agente.js) e processa como comando
 * do agente, mesmo mecanismo do comando por voz (comando-audio/route.ts).
 * A resposta não volta no corpo pro whatsapp-service usar — já entra na
 * fila de envio normal (Conversa/Mensagem) que ele já consome.
 */
export async function POST(request: Request) {
  let usuario;
  try {
    usuario = await requireApiUser(request);
  } catch (unauthorized) {
    return unauthorized as Response;
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Payload inválido" }, { status: 400 });
  }

  const telefone = parsed.data.telefone.replace(/\D/g, "");

  // Extrato bancário (.ofx) não passa pelo agente de IA de propósito —
  // importar e conciliar é uma operação determinística (parse do arquivo +
  // match por valor exato), não precisa de julgamento de modelo nenhum, e
  // gastar uma chamada de API pra isso seria desperdício (ver o incidente
  // de crédito de 2026-09-12). Resposta é montada aqui mesmo, em texto.
  if (parsed.data.anexoOfx) {
    const conversa = await encontrarOuCriarConversaPorTelefone({ telefone });
    let texto: string;
    try {
      const bytes = Buffer.from(parsed.data.anexoOfx.base64, "base64");
      const resultado = await importarExtratoOfx({ nomeArquivo: parsed.data.anexoOfx.nomeArquivo, bytes, importadoPorId: usuario.id });
      const pendentes = resultado.novasImportadas - resultado.conciliadasAutomaticamente;
      texto =
        `📄 Extrato *${parsed.data.anexoOfx.nomeArquivo}* importado: *${resultado.novasImportadas}* transação(ões) nova(s)` +
        (resultado.duplicadasIgnoradas > 0 ? ` (${resultado.duplicadasIgnoradas} já existiam, ignoradas)` : "") +
        `.\n\n✅ *${resultado.conciliadasAutomaticamente}* conciliada(s) automaticamente (mesmo valor exato de um negócio).\n` +
        `${pendentes > 0 ? `⏳ *${pendentes}* pendente(s) de revisão manual` : "Nenhuma pendência"} em Financeiro → Conciliação bancária.`;
    } catch (erro) {
      texto = erro instanceof Error ? erro.message : "Falha ao importar o extrato.";
    }
    await registrarMensagem({ conversaId: conversa.id, texto, direcao: "SAIDA", origem: "SISTEMA" });
    return NextResponse.json({ resposta: texto });
  }

  try {
    const resultado = await processarComandoAgente({
      texto:
        parsed.data.texto?.trim() ||
        (parsed.data.anexoPdf
          ? "Segue o PDF anexado."
          : parsed.data.anexoImagem
            ? "Segue a imagem anexada."
            : "Segue o arquivo anexado."),
      origem: "WHATSAPP",
      identificador: telefone,
      usuarioId: usuario.id,
      anexoPdf: parsed.data.anexoPdf
        ? { base64: parsed.data.anexoPdf.base64, nomeArquivo: parsed.data.anexoPdf.nomeArquivo || "documento.pdf" }
        : undefined,
      anexoImagem: parsed.data.anexoImagem
        ? { base64: parsed.data.anexoImagem.base64, mimetype: parsed.data.anexoImagem.mimetype }
        : undefined,
      anexoArquivo: parsed.data.anexoArquivo
        ? { base64: parsed.data.anexoArquivo.base64, nomeArquivo: parsed.data.anexoArquivo.nomeArquivo, mimetype: parsed.data.anexoArquivo.mimetype }
        : undefined,
    });

    const conversa = await encontrarOuCriarConversaPorTelefone({ telefone });
    await registrarMensagem({ conversaId: conversa.id, texto: resultado.resposta, direcao: "SAIDA", origem: "SISTEMA" });

    return NextResponse.json({ resposta: resultado.resposta });
  } catch (erro) {
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Falha ao processar comando." }, { status: 500 });
  }
}
