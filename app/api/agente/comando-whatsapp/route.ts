import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api-token";
import { processarComandoAgente } from "@/lib/server/agente";
import { encontrarOuCriarConversaPorTelefone, registrarMensagem } from "@/lib/server/conversas";
import { importarExtratoDaMensagem } from "@/lib/server/conciliacao-bancaria";
import { agenteLigado } from "@/lib/utils/agente-canal";

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
  // Comandos internos desligados no WhatsApp pra esse usuário (User.canaisAgente).
  if (!agenteLigado(usuario.canaisAgente, "whatsapp")) return NextResponse.json({ ignorado: true });

  // Extrato bancário (.ofx) não passa pelo agente de IA de propósito —
  // importar é uma operação determinística (parse do arquivo + busca de
  // pares por valor exato), não precisa de julgamento de modelo nenhum, e
  // gastar uma chamada de API pra isso seria desperdício (ver o incidente
  // de crédito de 2026-09-12). Nada é conciliado aqui: os pares e sugestões
  // esperam confirmação na tela. Resposta é montada aqui mesmo, em texto.
  if (parsed.data.anexoOfx) {
    const conversa = await encontrarOuCriarConversaPorTelefone({ telefone });
    const texto = await importarExtratoDaMensagem({
      nomeArquivo: parsed.data.anexoOfx.nomeArquivo,
      bytes: Buffer.from(parsed.data.anexoOfx.base64, "base64"),
      usuarioId: usuario.id,
    });
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
    await registrarMensagem({ conversaId: conversa.id, texto: resultado.resposta, direcao: "SAIDA", origem: "SISTEMA", enquete: resultado.enquete });

    return NextResponse.json({ resposta: resultado.resposta });
  } catch (erro) {
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Falha ao processar comando." }, { status: 500 });
  }
}
