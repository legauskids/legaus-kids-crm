import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api-token";
import { definirTagsContato } from "@/lib/server/contatos";

const bodySchema = z.object({
  telefone: z.string().min(1),
  tags: z.array(z.string()),
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

  const contato = await definirTagsContato(parsed.data.telefone, parsed.data.tags);
  return NextResponse.json({ ok: true, tags: contato.tags });
}
