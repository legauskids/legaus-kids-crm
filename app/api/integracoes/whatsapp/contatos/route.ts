import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api-token";
import { buscarContatoComNegociosPorTelefone, salvarContatoPorTelefone } from "@/lib/server/contatos";

const bodySchema = z.object({
  telefone: z.string().min(1),
  nome: z.string().optional(),
  empresa: z.string().optional(),
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

  const contato = await buscarContatoComNegociosPorTelefone(telefone);
  if (!contato) {
    return NextResponse.json({ existe: false });
  }

  return NextResponse.json({
    existe: true,
    contato: { id: contato.id, nome: contato.nome, telefone: contato.telefone, empresa: contato.empresa },
    negocios: contato.negocios.map((negocio) => ({
      id: negocio.id,
      titulo: negocio.titulo,
      valorCentavos: negocio.valorCentavos,
      funil: negocio.funil.nome,
      etapa: negocio.etapa.nome,
    })),
  });
}

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
