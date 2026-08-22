import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api-token";
import { salvarContatoPorTelefone } from "@/lib/server/contatos";

const bodySchema = z.object({
  telefone: z.string().min(1),
  nome: z.string().optional(),
  empresa: z.string().optional(),
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

  const contato = await salvarContatoPorTelefone(parsed.data);
  return NextResponse.json({ ok: true, contato });
}
