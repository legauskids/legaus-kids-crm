import "server-only";
import { prisma } from "@/lib/db";
import type { TipoCentroCusto } from "@prisma/client";

// Centros de custo padrão pras despesas/receitas que não são de um projeto
// (o projeto é o próprio Negocio). Ver RateioTransacao no schema.

export function listCentrosCusto({ incluirInativos = false }: { incluirInativos?: boolean } = {}) {
  return prisma.centroCusto.findMany({
    where: incluirInativos ? undefined : { ativo: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
  });
}

function limparPalavrasChave(palavras: string[]): string[] {
  return [...new Set(palavras.map((p) => p.trim()).filter(Boolean))];
}

export async function criarCentroCusto(input: { nome: string; tipo: TipoCentroCusto; palavrasChave: string[] }) {
  const nome = input.nome.trim();
  if (!nome) throw new Error("Dê um nome ao centro de custo.");
  const maiorOrdem = await prisma.centroCusto.aggregate({ _max: { ordem: true } });
  return prisma.centroCusto.create({
    data: { nome, tipo: input.tipo, palavrasChave: limparPalavrasChave(input.palavrasChave), ordem: (maiorOrdem._max.ordem ?? 0) + 1 },
  });
}

export function atualizarCentroCusto(
  id: string,
  input: { nome?: string; tipo?: TipoCentroCusto; palavrasChave?: string[]; ativo?: boolean },
) {
  if (input.nome !== undefined && !input.nome.trim()) throw new Error("O nome não pode ficar vazio.");
  return prisma.centroCusto.update({
    where: { id },
    data: {
      ...(input.nome !== undefined ? { nome: input.nome.trim() } : {}),
      ...(input.tipo !== undefined ? { tipo: input.tipo } : {}),
      ...(input.palavrasChave !== undefined ? { palavrasChave: limparPalavrasChave(input.palavrasChave) } : {}),
      ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
    },
  });
}
