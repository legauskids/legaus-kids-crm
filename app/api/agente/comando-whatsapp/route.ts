import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api-token";
import { processarComandoAgente } from "@/lib/server/agente";
import { encontrarOuCriarConversaPorTelefone, registrarMensagem } from "@/lib/server/conversas";

const bodySchema = z
  .object({
    telefone: z.string().min(8),
    texto: z.string().optional(),
    anexoPdf: z.object({ base64: z.string().min(1), nomeArquivo: z.string().optional() }).optional(),
    anexoImagem: z.object({ base64: z.string().min(1), mimetype: z.string().min(1) }).optional(),
  })
  .refine((d) => (d.texto && d.texto.trim().length > 0) || d.anexoPdf || d.anexoImagem, {
    message: "Informe texto, anexoPdf ou anexoImagem.",
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

  try {
    const resultado = await processarComandoAgente({
      texto: parsed.data.texto?.trim() || (parsed.data.anexoPdf ? "Segue o PDF anexado." : "Segue a imagem anexada."),
      origem: "WHATSAPP",
      identificador: telefone,
      usuarioId: usuario.id,
      anexoPdf: parsed.data.anexoPdf
        ? { base64: parsed.data.anexoPdf.base64, nomeArquivo: parsed.data.anexoPdf.nomeArquivo || "documento.pdf" }
        : undefined,
      anexoImagem: parsed.data.anexoImagem
        ? { base64: parsed.data.anexoImagem.base64, mimetype: parsed.data.anexoImagem.mimetype }
        : undefined,
    });

    const conversa = await encontrarOuCriarConversaPorTelefone({ telefone });
    await registrarMensagem({ conversaId: conversa.id, texto: resultado.resposta, direcao: "SAIDA", origem: "SISTEMA" });

    return NextResponse.json({ resposta: resultado.resposta });
  } catch (erro) {
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Falha ao processar comando." }, { status: 500 });
  }
}
