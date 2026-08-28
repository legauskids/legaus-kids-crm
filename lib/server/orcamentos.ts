import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import type { StatusOrcamento } from "@prisma/client";

const ITENS_COM_IMAGEM = {
  orderBy: { ordem: "asc" as const },
  include: { produto: { select: { imagemUrl: true } } },
};

export function listarOrcamentos() {
  return prisma.orcamento.findMany({
    include: {
      contato: true,
      responsavel: true,
      itens: true,
    },
    orderBy: { numero: "desc" },
  });
}

export function buscarOrcamentoPorId(id: string) {
  return prisma.orcamento.findUnique({
    where: { id },
    include: {
      contato: true,
      responsavel: true,
      itens: ITENS_COM_IMAGEM,
    },
  });
}

export function buscarOrcamentoPorTokenPublico(token: string) {
  return prisma.orcamento.findUnique({
    where: { tokenPublico: token },
    include: {
      contato: true,
      responsavel: true,
      itens: ITENS_COM_IMAGEM,
    },
  });
}

/** Gera (se ainda não existir) e retorna o token de acesso público do orçamento. */
export async function garantirTokenPublico(id: string): Promise<string> {
  const orcamento = await prisma.orcamento.findUniqueOrThrow({ where: { id }, select: { tokenPublico: true } });
  if (orcamento.tokenPublico) return orcamento.tokenPublico;

  const token = crypto.randomBytes(16).toString("hex");
  await prisma.orcamento.update({ where: { id }, data: { tokenPublico: token } });
  return token;
}

export type ItemOrcamentoInput = {
  produtoId?: string | null;
  nome: string;
  quantidade: number;
  valorUnitarioCentavos: number;
};

export type SalvarOrcamentoInput = {
  orcamentoId?: string;
  contatoId?: string | null;
  responsavelId: string;
  status?: StatusOrcamento;
  observacoes?: string | null;
  descontoCentavos?: number;
  validadeDias?: number;
  itens: ItemOrcamentoInput[];
};

/** Cria ou atualiza um orçamento inteiro (cabeçalho + itens) numa transação. */
export async function salvarOrcamento(input: SalvarOrcamentoInput) {
  return prisma.$transaction(async (tx) => {
    const dadosCabecalho = {
      contatoId: input.contatoId || null,
      responsavelId: input.responsavelId,
      observacoes: input.observacoes || null,
      descontoCentavos: input.descontoCentavos ?? 0,
      validadeDias: input.validadeDias ?? 15,
      ...(input.status ? { status: input.status } : {}),
    };

    const orcamento = input.orcamentoId
      ? await tx.orcamento.update({ where: { id: input.orcamentoId }, data: dadosCabecalho })
      : await tx.orcamento.create({ data: dadosCabecalho });

    if (input.orcamentoId) {
      await tx.orcamentoItem.deleteMany({ where: { orcamentoId: orcamento.id } });
    }

    await tx.orcamentoItem.createMany({
      data: input.itens.map((item, indice) => ({
        orcamentoId: orcamento.id,
        produtoId: item.produtoId || null,
        nome: item.nome,
        quantidade: item.quantidade,
        valorUnitarioCentavos: item.valorUnitarioCentavos,
        ordem: indice,
      })),
    });

    return orcamento;
  });
}

export async function atualizarStatusOrcamento(id: string, status: StatusOrcamento): Promise<void> {
  await prisma.orcamento.update({ where: { id }, data: { status } });
}

export async function excluirOrcamento(id: string): Promise<void> {
  await prisma.orcamento.delete({ where: { id } });
}

export function calcularTotalCentavos(itens: { quantidade: number; valorUnitarioCentavos: number }[], descontoCentavos = 0): number {
  const subtotal = itens.reduce((soma, item) => soma + item.quantidade * item.valorUnitarioCentavos, 0);
  return Math.max(0, subtotal - descontoCentavos);
}
