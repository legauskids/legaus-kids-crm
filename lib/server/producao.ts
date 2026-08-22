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
