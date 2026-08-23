import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api-token";
import {
  cancelarMensagemAgendada,
  criarMensagemAgendada,
  encontrarOuCriarConversaPorTelefone,
  listMensagensAgendadasPorTelefone,
} from "@/lib/server/conversas";

const bodySchema = z.object({
  telefone: z.string().min(1),
  nomeContato: z.string().optional(),
  texto: z.string().min(1),
  agendadaPara: z.string().min(1),
});

const deleteSchema = z.object({
  id: z.string().min(1),
});

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
  } catch (unauthorized) {
    return unauthorized as Response;
  }

  const telefone = new URL(request.url).searchParams.get("telefone") ?? "";
  if (!telefone) {
    return NextResponse.json({ error: "Parâmetro telefone é obrigatório" }, { status: 400 });
  }

  const agendadas = await listMensagensAgendadasPorTelefone(telefone);
  return NextResponse.json({
    agendadas: agendadas.map((a) => ({ id: a.id, texto: a.texto, agendadaPara: a.agendadaPara })),
  });
}

export async function POST(request: Request) {
  let user;
  try {
    user = await requireApiUser(request);
  } catch (unauthorized) {
    return unauthorized as Response;
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Payload inválido" }, { status: 400 });
  }

  const agendadaPara = new Date(parsed.data.agendadaPara);
  if (Number.isNaN(agendadaPara.getTime())) {
    return NextResponse.json({ error: "Data/hora inválida" }, { status: 400 });
  }

  const conversa = await encontrarOuCriarConversaPorTelefone({
    telefone: parsed.data.telefone,
    nomeContato: parsed.data.nomeContato,
  });
  const agendada = await criarMensagemAgendada({
    conversaId: conversa.id,
    texto: parsed.data.texto,
    agendadaPara,
    criadaPorId: user.id,
  });

  return NextResponse.json({ ok: true, agendadaId: agendada.id });
}

export async function DELETE(request: Request) {
  try {
    await requireApiUser(request);
  } catch (unauthorized) {
    return unauthorized as Response;
  }

  const parsed = deleteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Payload inválido" }, { status: 400 });
  }

  await cancelarMensagemAgendada(parsed.data.id);
  return NextResponse.json({ ok: true });
}
