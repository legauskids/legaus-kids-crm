import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api-token";
import { salvarOrcamento } from "@/lib/server/orcamentos";

const itemSchema = z.object({
  produtoId: z.string().optional(),
  nome: z.string().min(1),
  quantidade: z.coerce.number().int().min(1).default(1),
  valorUnitarioCentavos: z.coerce.number().int().min(0),
});

const bodySchema = z.object({
  contatoId: z.string().optional(),
  observacoes: z.string().optional(),
  descontoCentavos: z.coerce.number().int().min(0).optional(),
  validadeDias: z.coerce.number().int().min(1).optional(),
  itens: z.array(itemSchema).min(1),
});

/**
 * Cria um orçamento inteiro num só POST — o endpoint que um agente de
 * IA/comando de voz usaria pra "monta um orçamento pro cliente X com
 * produto Y" de ponta a ponta, sem passar pela tela. Reaproveita a mesma
 * função que o editor visual usa (lib/server/orcamentos.ts), então o
 * resultado é idêntico a um orçamento criado manualmente.
 */
export async function POST(request: Request) {
  let usuario;
  try {
    usuario = await requireApiUser(request);
  } catch (unauthorized) {
    return unauthorized as Response;
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Payload inválido" }, { status: 400 });
  }

  const orcamento = await salvarOrcamento({
    contatoId: parsed.data.contatoId || null,
    responsavelId: usuario.id,
    observacoes: parsed.data.observacoes || null,
    descontoCentavos: parsed.data.descontoCentavos ?? 0,
    validadeDias: parsed.data.validadeDias ?? 15,
    itens: parsed.data.itens.map((i) => ({
      produtoId: i.produtoId || null,
      nome: i.nome,
      quantidade: i.quantidade,
      valorUnitarioCentavos: i.valorUnitarioCentavos,
    })),
  });

  return NextResponse.json({ orcamento: { id: orcamento.id, numero: orcamento.numero } });
}
