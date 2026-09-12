import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api-token";
import {
  encontrarOuCriarConversaPorTelefone,
  encontrarMensagemPorExternalId,
  registrarMensagem,
} from "@/lib/server/conversas";
import { transcreverAudio, transcricaoConfigurada } from "@/lib/server/transcricao";

const bodySchema = z.object({
  telefone: z.string().min(1),
  nomeContato: z.string().optional(),
  texto: z.string().min(1),
  direcao: z.enum(["ENTRADA", "SAIDA"]),
  externalId: z.string().min(1),
  enviadaEm: z.string().optional(),
  // Preenchido quando a mensagem é um contato compartilhado (vCard) — o
  // whatsapp-service já manda um texto amigável, isso aqui só liga o botão
  // "Adicionar ao CRM" na UI.
  contatoCompartilhado: z.object({ nome: z.string().min(1), telefone: z.string().min(1) }).optional(),
  // Anexo que chegou de verdade do WhatsApp (foto, documento, áudio) — o
  // whatsapp-service já baixa e descriptografa antes de mandar pra cá.
  anexo: z
    .object({ base64: z.string().min(1), nome: z.string().optional(), mimetype: z.string().min(1) })
    .optional(),
});

export async function POST(request: Request) {
  try {
    await requireApiUser(request);
  } catch (unauthorized) {
    return unauthorized as Response;
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Payload inválido" }, { status: 400 });
  }

  const existente = await encontrarMensagemPorExternalId(parsed.data.externalId);
  if (existente) {
    return NextResponse.json({ ok: true, mensagemId: existente.id, duplicada: true });
  }

  const conversa = await encontrarOuCriarConversaPorTelefone({
    telefone: parsed.data.telefone,
    nomeContato: parsed.data.nomeContato,
  });

  // Nota de voz recebida chegava aqui só como "📎 audio-xxx.ogg" — nem o
  // Atendimento, nem a sugestão automática de lead novo, nem o agente
  // conseguiam entender o que a pessoa disse. Transcreve (mesmo motor já
  // usado pro comando de voz do agente) e usa a transcrição como texto da
  // mensagem — o áudio original continua salvo/acessível via anexoUrl.
  let texto = parsed.data.texto;
  if (parsed.data.anexo?.mimetype.startsWith("audio/") && transcricaoConfigurada()) {
    try {
      const transcricao = await transcreverAudio(Buffer.from(parsed.data.anexo.base64, "base64"), parsed.data.anexo.mimetype);
      if (transcricao) texto = `🎤 ${transcricao}`;
    } catch (erro) {
      console.error("Falha ao transcrever áudio recebido:", erro);
    }
  }

  const mensagem = await registrarMensagem({
    conversaId: conversa.id,
    texto,
    direcao: parsed.data.direcao,
    origem: "WHATSAPP",
    externalId: parsed.data.externalId,
    enviadaEm: parsed.data.enviadaEm ? new Date(parsed.data.enviadaEm) : undefined,
    contatoCompartilhadoNome: parsed.data.contatoCompartilhado?.nome,
    contatoCompartilhadoTelefone: parsed.data.contatoCompartilhado?.telefone,
    anexoBytes: parsed.data.anexo ? Buffer.from(parsed.data.anexo.base64, "base64") : undefined,
    anexoNome: parsed.data.anexo?.nome,
    anexoMimetype: parsed.data.anexo?.mimetype,
  });

  // Monitoramento automático (notificação + sugestão de IA a cada mensagem
  // recebida) foi desligado por pedido do Marcos em 2026-09-12 — gastava
  // uma chamada de API cheia de contexto em TODA mensagem de cliente, usada
  // ou não. A mensagem continua salva normalmente (Atendimento mostra na
  // hora); sugestão agora só sob demanda — botão no Composer ou pedindo
  // pro agente pelo WhatsApp (ferramenta sugerir_resposta_cliente).

  return NextResponse.json({ ok: true, mensagemId: mensagem.id, conversaId: conversa.id });
}
