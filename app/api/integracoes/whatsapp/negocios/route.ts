import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api-token";
import { salvarContatoPorTelefone } from "@/lib/server/contatos";
import { criarNegocio, getFunilComEtapas } from "@/lib/server/negocios";
import { reaisParaCentavos } from "@/lib/utils/money";

const bodySchema = z.object({
  telefone: z.string().min(1),
  nomeContato: z.string().optional(),
  titulo: z.string().min(1),
  funilId: z.string().min(1),
  valorReais: z.number().min(0).optional(),
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

  const funil = await getFunilComEtapas(parsed.data.funilId);
  const etapaInicial = funil?.etapas.find((etapa) => etapa.tipo === "NORMAL") ?? funil?.etapas[0];
  if (!funil || !etapaInicial) {
    return NextResponse.json({ error: "Funil inválido" }, { status: 400 });
  }

  const contato = await salvarContatoPorTelefone({
    telefone: parsed.data.telefone,
    nome: parsed.data.nomeContato,
  });

  const negocio = await criarNegocio({
    titulo: parsed.data.titulo,
    contatoId: contato.id,
    funilId: funil.id,
    etapaId: etapaInicial.id,
    valorCentavos: reaisParaCentavos(parsed.data.valorReais ?? 0),
    responsavelId: user.id,
    origem: "WhatsApp (extensão)",
  });

  return NextResponse.json({ ok: true, negocioId: negocio.id, contatoId: contato.id });
}
