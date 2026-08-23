import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api-token";
import { criarLembrete } from "@/lib/server/lembretes";

const bodySchema = z.object({
  nome: z.string().min(1),
  descricao: z.string().optional(),
  notificarEm: z.string().optional(),
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

  let notificarEm: Date | undefined;
  if (parsed.data.notificarEm) {
    notificarEm = new Date(parsed.data.notificarEm);
    if (Number.isNaN(notificarEm.getTime())) {
      return NextResponse.json({ error: "Data/hora inválida" }, { status: 400 });
    }
  }

  const lembrete = await criarLembrete({
    paraUsuarioId: user.id,
    nome: parsed.data.nome,
    descricao: parsed.data.descricao,
    notificarEm,
  });
  return NextResponse.json({ ok: true, lembreteId: lembrete.id });
}
