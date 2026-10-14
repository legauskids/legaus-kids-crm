import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api-token";
import { registrarFalhaEnvio } from "@/lib/server/falha-envio";

const bodySchema = z.object({
  mensagemId: z.string().min(1),
  motivo: z.string().min(1).max(60),
});

/** O whatsapp-service não enviou porque o número não tem WhatsApp (ver lib/server/falha-envio.ts). */
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

  const registrada = await registrarFalhaEnvio(parsed.data.mensagemId, parsed.data.motivo);
  return NextResponse.json({ ok: true, registrada });
}
