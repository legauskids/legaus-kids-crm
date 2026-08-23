import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api-token";
import { criarLembrete } from "@/lib/server/lembretes";

const bodySchema = z.object({
  texto: z.string().min(1),
});

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

  const lembrete = await criarLembrete({ paraUsuarioId: user.id, texto: parsed.data.texto });
  return NextResponse.json({ ok: true, lembreteId: lembrete.id });
}
