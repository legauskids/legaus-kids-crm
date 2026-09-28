import "server-only";
import { prisma } from "@/lib/db";

export function listEmProducao() {
  return prisma.negocio.findMany({
    where: { etapa: { nome: "Produção" } },
    include: { contato: true, etapa: true, responsavel: true },
    orderBy: { previsaoProducao: "asc" },
  });
}

export function listInstalacoes() {
  return prisma.negocio.findMany({
    where: { dataInstalacao: { not: null } },
    include: { contato: true, etapa: true, responsavel: true },
    orderBy: { dataInstalacao: "asc" },
  });
}

/** Pós-venda na etapa Avaliação — o último passo antes do "Concluído". */
export function listEmAvaliacao() {
  return prisma.negocio.findMany({
    where: { funil: { nome: "Funil de pós-venda" }, etapa: { nome: "Avaliação", tipo: "NORMAL" } },
    include: { contato: true, etapa: true, responsavel: true },
    orderBy: { dataEntradaNaEtapa: "asc" },
  });
}

/** Negócios encerrados na etapa final (tipo CONCLUIDO), mais recentes primeiro. */
export function listConcluidos() {
  return prisma.negocio.findMany({
    where: { etapa: { tipo: "CONCLUIDO" } },
    include: { contato: true, responsavel: true },
    orderBy: { dataEntradaNaEtapa: "desc" },
  });
}
