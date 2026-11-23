import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import type { StatusOrcamento } from "@prisma/client";
import type { ClienteBuscavel } from "@/lib/utils/busca-cliente";
import { registrarVinculoOrcamentoNegocio } from "@/lib/server/orcamento-negocio";

const ITENS_COM_IMAGEM = {
  orderBy: { ordem: "asc" as const },
  include: { produto: { select: { imagemUrl: true } } },
};

/** Contatos pra busca do cliente no orçamento por nome, CPF, CNPJ ou telefone (seletor-cliente.tsx). */
export async function listarClientesParaOrcamento(): Promise<ClienteBuscavel[]> {
  const contatos = await prisma.contato.findMany({
    select: { id: true, nome: true, empresa: true, razaoSocial: true, cnpj: true, representanteLegalCpf: true, telefone: true, tipo: true },
    orderBy: { nome: "asc" },
  });
  return contatos.map(({ representanteLegalCpf, ...c }) => ({ ...c, cpf: representanteLegalCpf }));
}

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
  descricao?: string | null;
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
  // undefined: não mexe no negócio do orçamento; null: tira do negócio.
  negocioId?: string | null;
  itens: ItemOrcamentoInput[];
};

/** Cria ou atualiza um orçamento inteiro (cabeçalho + itens) numa transação. */
export async function salvarOrcamento(input: SalvarOrcamentoInput) {
  return prisma.$transaction(async (tx) => {
    const negocioAnterior = input.orcamentoId
      ? ((await tx.orcamento.findUnique({ where: { id: input.orcamentoId }, select: { negocioId: true } }))?.negocioId ?? null)
      : null;
    const dadosCabecalho = {
      contatoId: input.contatoId || null,
      responsavelId: input.responsavelId,
      observacoes: input.observacoes || null,
      descontoCentavos: input.descontoCentavos ?? 0,
      validadeDias: input.validadeDias ?? 15,
      ...(input.status ? { status: input.status } : {}),
      ...(input.negocioId !== undefined ? { negocioId: input.negocioId } : {}),
    };

    const orcamento = input.orcamentoId
      ? await tx.orcamento.update({ where: { id: input.orcamentoId }, data: dadosCabecalho })
      : await tx.orcamento.create({ data: dadosCabecalho });

    if (input.negocioId !== undefined) {
      await registrarVinculoOrcamentoNegocio(tx, {
        orcamentoId: orcamento.id,
        numero: orcamento.numero,
        de: negocioAnterior,
        para: orcamento.negocioId,
        autorId: input.responsavelId,
      });
    }

    if (input.orcamentoId) {
      await tx.orcamentoItem.deleteMany({ where: { orcamentoId: orcamento.id } });
    }

    await tx.orcamentoItem.createMany({
      data: input.itens.map((item, indice) => ({
        orcamentoId: orcamento.id,
        produtoId: item.produtoId || null,
        nome: item.nome,
        descricao: item.descricao || null,
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

export type OrcamentoParaAnexar = {
  id: string;
  numero: number;
  status: StatusOrcamento;
  cliente: string | null;
  doCliente: boolean;
  negocioAtual: string | null;
  totalCentavos: number;
};

/** Orçamentos que ainda não são deste negócio, os do mesmo cliente primeiro ("Anexar orçamento" do histórico). */
export async function listarOrcamentosParaAnexar(negocioId: string): Promise<OrcamentoParaAnexar[]> {
  const [negocio, orcamentos] = await Promise.all([
    prisma.negocio.findUnique({ where: { id: negocioId }, select: { contatoId: true } }),
    prisma.orcamento.findMany({
      where: { OR: [{ negocioId: null }, { negocioId: { not: negocioId } }] },
      select: {
        id: true,
        numero: true,
        status: true,
        contatoId: true,
        descontoCentavos: true,
        contato: { select: { nome: true } },
        negocio: { select: { titulo: true } },
        itens: { select: { quantidade: true, valorUnitarioCentavos: true } },
      },
      orderBy: { numero: "desc" },
      take: 300,
    }),
  ]);
  const contatoId = negocio?.contatoId ?? null;
  return orcamentos
    .map((o) => ({
      id: o.id,
      numero: o.numero,
      status: o.status,
      cliente: o.contato?.nome ?? null,
      doCliente: contatoId !== null && o.contatoId === contatoId,
      negocioAtual: o.negocio?.titulo ?? null,
      totalCentavos: calcularTotalCentavos(o.itens, o.descontoCentavos),
    }))
    .sort((a, b) => Number(b.doCliente) - Number(a.doCliente));
}

export function calcularTotalCentavos(itens: { quantidade: number; valorUnitarioCentavos: number }[], descontoCentavos = 0): number {
  const subtotal = itens.reduce((soma, item) => soma + item.quantidade * item.valorUnitarioCentavos, 0);
  return Math.max(0, subtotal - descontoCentavos);
}
