import "server-only";
import { prisma } from "@/lib/db";

// Orçamento vinculado ao negócio (pedido de 2026-11-23). O vínculo é o
// Orcamento.negocioId; o registro fica no histórico do negócio como Atividade
// ORCAMENTO, com link vivo para o orçamento e o PDF. No Ganho, o pós-venda
// nasce com os orçamentos do negócio de venda no histórico.

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const numero4 = (numero: number) => String(numero).padStart(4, "0");

export type NegocioParaOrcamento = {
  id: string;
  titulo: string;
  contatoId: string | null;
  cliente: string | null;
  etapa: string;
  funil: string;
};

const CAMPOS_NEGOCIO = {
  id: true,
  titulo: true,
  contatoId: true,
  excluidoEm: true,
  contato: { select: { nome: true } },
  etapa: { select: { nome: true } },
  funil: { select: { nome: true } },
} as const;

/** Negócios em andamento para o campo "Negócio" do orçamento (mais o já escolhido, mesmo se fechado ou excluído). */
export async function listarNegociosParaOrcamento(incluirId?: string | null): Promise<NegocioParaOrcamento[]> {
  const negocios = await prisma.negocio.findMany({
    where: { OR: [{ etapa: { tipo: "NORMAL" } }, ...(incluirId ? [{ id: incluirId }] : [])] },
    select: CAMPOS_NEGOCIO,
    orderBy: { updatedAt: "desc" },
  });
  // O findMany não traz excluído (lib/db.ts); o findUnique traz.
  if (incluirId && !negocios.some((n) => n.id === incluirId)) {
    const escolhido = await prisma.negocio.findUnique({ where: { id: incluirId }, select: CAMPOS_NEGOCIO });
    if (escolhido) negocios.push(escolhido);
  }
  return negocios.map((n) => ({
    id: n.id,
    titulo: n.excluidoEm ? `${n.titulo} (excluído)` : n.titulo,
    contatoId: n.contatoId,
    cliente: n.contato?.nome ?? null,
    etapa: n.etapa.nome,
    funil: n.funil.nome,
  }));
}

/** Negócio que pode receber orçamento: existe e não foi excluído (o findFirst já tira os excluídos). */
export function negocioParaVincular(negocioId: string) {
  return prisma.negocio.findFirst({ where: { id: negocioId }, select: { id: true, contatoId: true } });
}

/** Põe no histórico a troca de negócio do orçamento (nada se não mudou). */
export async function registrarVinculoOrcamentoNegocio(
  tx: Tx,
  input: { orcamentoId: string; numero: number; de: string | null; para: string | null; autorId: string },
) {
  if (input.de === input.para) return;
  const n = numero4(input.numero);
  if (input.de) {
    await tx.atividade.create({
      data: { negocioId: input.de, tipo: "SISTEMA", texto: `Orçamento nº ${n} desvinculado deste negócio.`, autorId: input.autorId },
    });
  }
  if (input.para) {
    await tx.atividade.create({
      data: { negocioId: input.para, tipo: "ORCAMENTO", texto: `Orçamento nº ${n} anexado.`, orcamentoId: input.orcamentoId, autorId: input.autorId },
    });
  }
}

/** "Anexar orçamento" do negócio: o orçamento passa a ser deste negócio. */
export async function anexarOrcamentoAoNegocio(negocioId: string, orcamentoId: string, autorId: string) {
  if (!(await negocioParaVincular(negocioId))) throw new Error("Negócio não encontrado.");
  await prisma.$transaction(async (tx) => {
    const orcamento = await tx.orcamento.findUnique({ where: { id: orcamentoId }, select: { numero: true, negocioId: true } });
    if (!orcamento) throw new Error("Orçamento não encontrado.");
    if (orcamento.negocioId === negocioId) throw new Error("Esse orçamento já está neste negócio.");
    await tx.orcamento.update({ where: { id: orcamentoId }, data: { negocioId } });
    await registrarVinculoOrcamentoNegocio(tx, { orcamentoId, numero: orcamento.numero, de: orcamento.negocioId, para: negocioId, autorId });
  });
}

/**
 * No Ganho: o pós-venda nasce com os orçamentos do negócio de venda no
 * histórico. Chamar depois da atividade "pós-venda criado" — a hora explícita
 * deixa os orçamentos acima dela na lista.
 */
export async function anexarOrcamentosNoPosVenda(tx: Tx, negocioVendaId: string, negocioPosVendaId: string) {
  const orcamentos = await tx.orcamento.findMany({
    where: { negocioId: negocioVendaId },
    select: { id: true, numero: true },
    orderBy: { numero: "asc" },
  });
  if (orcamentos.length === 0) return;
  const criadoEm = new Date();
  await tx.atividade.createMany({
    data: orcamentos.map((o) => ({
      negocioId: negocioPosVendaId,
      tipo: "ORCAMENTO" as const,
      texto: `Orçamento nº ${numero4(o.numero)} anexado (veio do negócio de venda).`,
      orcamentoId: o.id,
      criadoEm,
    })),
  });
}
