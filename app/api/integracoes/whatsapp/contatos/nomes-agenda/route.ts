import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api-token";
import { aplicarNomesDaAgenda } from "@/lib/server/contatos";

// Nomes salvos/editados na agenda do celular da Legaus, repassados pelo
// whatsapp-service (agenda.js) — ver aplicarNomesDaAgenda.
const bodySchema = z.object({
  contatos: z
    .array(z.object({ telefone: z.string().min(8).max(30), nome: z.string().min(1).max(300) }))
    .min(1)
    .max(500),
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

  const resultado = await aplicarNomesDaAgenda(parsed.data.contatos);
  return NextResponse.json({ ok: true, ...resultado });
}
