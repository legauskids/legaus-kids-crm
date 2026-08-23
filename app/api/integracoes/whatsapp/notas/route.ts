import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api-token";
import { encontrarOuCriarConversaPorTelefone, criarNotaInterna } from "@/lib/server/conversas";
import { prisma } from "@/lib/db";

const bodySchema = z.object({
  telefone: z.string().min(1),
  texto: z.string().min(1),
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

  const digitos = telefone.replace(/\D/g, "");
  const contato = await prisma.contato.findUnique({
    where: { telefone: digitos },
    include: { conversas: { include: { notas: { orderBy: { criadaEm: "desc" }, include: { autor: true } } } } },
  });

  const notas = contato?.conversas[0]?.notas ?? [];
  return NextResponse.json({
    notas: notas.map((n) => ({ id: n.id, texto: n.texto, autorNome: n.autor.nome, criadaEm: n.criadaEm })),
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

  const conversa = await encontrarOuCriarConversaPorTelefone({ telefone: parsed.data.telefone });
  const nota = await criarNotaInterna(conversa.id, user.id, parsed.data.texto);
  return NextResponse.json({ ok: true, notaId: nota.id });
}
