import "server-only";
import { prisma } from "@/lib/db";
import type { TipoTransacaoBancaria } from "@prisma/client";

export function listSimulacoes() {
  return prisma.simulacaoFinanceira.findMany({ orderBy: { data: "asc" } });
}

export function criarSimulacao(input: { descricao: string; valorCentavos: number; tipo: TipoTransacaoBancaria; data: Date | null; criadaPorId: string }) {
  return prisma.simulacaoFinanceira.create({
    data: {
      descricao: input.descricao,
      valorCentavos: input.valorCentavos,
      tipo: input.tipo,
      data: input.data,
      criadaPorId: input.criadaPorId,
    },
  });
}

export function excluirSimulacao(id: string) {
  return prisma.simulacaoFinanceira.delete({ where: { id } });
}
