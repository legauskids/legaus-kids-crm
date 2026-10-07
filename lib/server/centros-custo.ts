import "server-only";
import { prisma } from "@/lib/db";
import type { TipoCentroCusto } from "@prisma/client";

// Categorias (tabela CentroCusto — natureza do gasto/receita) e centros de
// custo gerais (Veículos, Produção...). O projeto (Negocio) é o outro tipo de
// centro de custo. Ver CentroCusto/CentroGeral no schema.

export function listCentrosCusto({ incluirInativos = false }: { incluirInativos?: boolean } = {}) {
  return prisma.centroCusto.findMany({
    where: incluirInativos ? undefined : { ativo: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
  });
}

function limparPalavrasChave(palavras: string[]): string[] {
  return [...new Set(palavras.map((p) => p.trim()).filter(Boolean))];
}

export async function criarCentroCusto(input: {
  nome: string;
  tipo: TipoCentroCusto;
  palavrasChave: string[];
  centroGeralPadraoId?: string | null;
}) {
  const nome = input.nome.trim();
  if (!nome) throw new Error("Dê um nome à categoria.");
  const maiorOrdem = await prisma.centroCusto.aggregate({ _max: { ordem: true } });
  return prisma.centroCusto.create({
    data: {
      nome,
      tipo: input.tipo,
      palavrasChave: limparPalavrasChave(input.palavrasChave),
      centroGeralPadraoId: input.centroGeralPadraoId || null,
      ordem: (maiorOrdem._max.ordem ?? 0) + 1,
    },
  });
}

export function atualizarCentroCusto(
  id: string,
  input: { nome?: string; tipo?: TipoCentroCusto; palavrasChave?: string[]; ativo?: boolean; centroGeralPadraoId?: string | null },
) {
  if (input.nome !== undefined && !input.nome.trim()) throw new Error("O nome não pode ficar vazio.");
  return prisma.centroCusto.update({
    where: { id },
    data: {
      ...(input.nome !== undefined ? { nome: input.nome.trim() } : {}),
      ...(input.tipo !== undefined ? { tipo: input.tipo } : {}),
      ...(input.palavrasChave !== undefined ? { palavrasChave: limparPalavrasChave(input.palavrasChave) } : {}),
      ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
      ...(input.centroGeralPadraoId !== undefined ? { centroGeralPadraoId: input.centroGeralPadraoId || null } : {}),
    },
  });
}

export function listCentrosGerais({ incluirInativos = false }: { incluirInativos?: boolean } = {}) {
  return prisma.centroGeral.findMany({
    where: incluirInativos ? undefined : { ativo: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
  });
}

export async function criarCentroGeral(nomeBruto: string) {
  const nome = nomeBruto.trim();
  if (!nome) throw new Error("Dê um nome ao centro de custo.");
  const maiorOrdem = await prisma.centroGeral.aggregate({ _max: { ordem: true } });
  return prisma.centroGeral.create({ data: { nome, ordem: (maiorOrdem._max.ordem ?? 0) + 1 } });
}

export function atualizarCentroGeral(id: string, input: { nome?: string; ativo?: boolean }) {
  if (input.nome !== undefined && !input.nome.trim()) throw new Error("O nome não pode ficar vazio.");
  return prisma.centroGeral.update({
    where: { id },
    data: {
      ...(input.nome !== undefined ? { nome: input.nome.trim() } : {}),
      ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
    },
  });
}
