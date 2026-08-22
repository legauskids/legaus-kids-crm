import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api-token";
import {
  encontrarOuCriarConversaPorTelefone,
  encontrarMensagemPorExternalId,
  registrarMensagem,
} from "@/lib/server/conversas";

const bodySchema = z.object({
  telefone: z.string().min(1),
  nomeContato: z.string().optional(),
  texto: z.string().min(1),
  direcao: z.enum(["ENTRADA", "SAIDA"]),
  externalId: z.string().min(1),
  enviadaEm: z.string().optional(),
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

  const mensagem = await registrarMensagem({
    conversaId: conversa.id,
    texto: parsed.data.texto,
    direcao: parsed.data.direcao,
    origem: "WHATSAPP",
    externalId: parsed.data.externalId,
    enviadaEm: parsed.data.enviadaEm ? new Date(parsed.data.enviadaEm) : undefined,
  });

  return NextResponse.json({ ok: true, mensagemId: mensagem.id, conversaId: conversa.id });
}
