import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api-token";
import { criarContato, normalizarTelefone } from "@/lib/server/contatos";
import { prisma } from "@/lib/db";

const bodySchema = z.object({
  nome: z.string().min(1),
  telefone: z.string().optional(),
  empresa: z.string().optional(),
  tipo: z.enum(["CONTATO", "CLIENTE", "FORNECEDOR"]).default("CONTATO"),
});

/**
 * Cria (ou retorna, se o telefone já existir) um contato/cliente/fornecedor
 * — pensado pra um agente de IA/automação encontrar ou criar quem vai
 * receber um orçamento sem precisar passar pela tela.
 */
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

  if (parsed.data.telefone) {
    const existente = await prisma.contato.findUnique({
      where: { telefone: normalizarTelefone(parsed.data.telefone) },
    });
    if (existente) {
      return NextResponse.json({ contato: existente, criado: false });
    }
  }

  const contato = await criarContato({
    nome: parsed.data.nome,
    telefone: parsed.data.telefone || null,
    empresa: parsed.data.empresa || null,
    tipo: parsed.data.tipo,
  });

  return NextResponse.json({ contato, criado: true });
}
