import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api-token";
import { transcreverAudio } from "@/lib/server/transcricao";
import { processarComandoAgente } from "@/lib/server/agente";
import { encontrarOuCriarConversaPorTelefone, registrarMensagem } from "@/lib/server/conversas";

const bodySchema = z.object({
  telefone: z.string().min(8),
  audioBase64: z.string().min(1),
  mimetype: z.string().default("audio/ogg"),
});

/**
 * Recebe um áudio (nota de voz do WhatsApp, já baixado pelo whatsapp-service),
 * transcreve e processa como comando do agente. A resposta do agente não
 * volta no corpo pro whatsapp-service usar — ela já entra na fila de envio
 * normal (Conversa/Mensagem) que o whatsapp-service já consome via
 * /api/integracoes/whatsapp/fila-envio, então essa rota só confirma que
 * processou.
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
  const audio = Buffer.from(parsed.data.audioBase64, "base64");

  try {
    const texto = await transcreverAudio(audio, parsed.data.mimetype);
    if (!texto) {
      return NextResponse.json({ error: "Não consegui entender o áudio." }, { status: 422 });
    }

    const resultado = await processarComandoAgente({
      texto,
      origem: "WHATSAPP",
      identificador: telefone,
      usuarioId: usuario.id,
    });

    // A resposta do agente entra na mesma fila de envio que qualquer outra
    // mensagem de saída — o whatsapp-service já consome isso periodicamente.
    const conversa = await encontrarOuCriarConversaPorTelefone({ telefone });
    await registrarMensagem({ conversaId: conversa.id, texto: resultado.resposta, direcao: "SAIDA", origem: "SISTEMA" });

    return NextResponse.json({ transcricao: texto, resposta: resultado.resposta });
  } catch (erro) {
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Falha ao processar áudio." }, { status: 500 });
  }
}
