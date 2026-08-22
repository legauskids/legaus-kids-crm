import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api-token";
import { confirmarEnvioMensagem } from "@/lib/server/conversas";

const bodySchema = z.object({
  mensagemId: z.string().min(1),
  externalId: z.string().min(1),
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

  await confirmarEnvioMensagem(parsed.data.mensagemId, parsed.data.externalId);
  return NextResponse.json({ ok: true });
}
