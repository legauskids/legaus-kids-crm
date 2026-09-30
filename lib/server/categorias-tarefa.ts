import "server-only";
import type { CampoExtraCategoria } from "@prisma/client";
import { prisma } from "@/lib/db";

// Categorias de compromisso da tarefa (Gerar Receita, Melhoria...) — o que o
// módulo Compromissos conta. Cadastráveis em Configurações (só admin).

const COR_HEX = /^#[0-9a-fA-F]{6}$/;

export function listCategoriasTarefa({ incluirInativas = false }: { incluirInativas?: boolean } = {}) {
  return prisma.categoriaTarefa.findMany({
    where: incluirInativas ? {} : { ativa: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    include: { _count: { select: { tarefas: true } } },
  });
}

function validar(dados: { nome?: string; cor?: string }) {
  if (dados.nome !== undefined && !dados.nome.trim()) throw new Error("Dê um nome para a categoria.");
  if (dados.cor !== undefined && !COR_HEX.test(dados.cor)) throw new Error("Cor inválida.");
}

export async function criarCategoriaTarefa(dados: { nome: string; cor: string; campoExtra: CampoExtraCategoria }) {
  validar(dados);
  const nome = dados.nome.trim();
  if (await prisma.categoriaTarefa.findUnique({ where: { nome } })) throw new Error(`Já existe a categoria "${nome}".`);
  const ultima = await prisma.categoriaTarefa.findFirst({ orderBy: { ordem: "desc" }, select: { ordem: true } });
  return prisma.categoriaTarefa.create({
    data: { nome, cor: dados.cor, campoExtra: dados.campoExtra, ordem: (ultima?.ordem ?? 0) + 1 },
  });
}

export async function atualizarCategoriaTarefa(
  id: string,
  dados: { nome?: string; cor?: string; campoExtra?: CampoExtraCategoria; ativa?: boolean },
) {
  validar(dados);
  const nome = dados.nome?.trim();
  if (nome) {
    const mesmoNome = await prisma.categoriaTarefa.findUnique({ where: { nome } });
    if (mesmoNome && mesmoNome.id !== id) throw new Error(`Já existe a categoria "${nome}".`);
  }
  return prisma.categoriaTarefa.update({
    where: { id },
    data: {
      ...(nome ? { nome } : {}),
      ...(dados.cor ? { cor: dados.cor } : {}),
      ...(dados.campoExtra ? { campoExtra: dados.campoExtra } : {}),
      ...(dados.ativa !== undefined ? { ativa: dados.ativa } : {}),
    },
  });
}

export async function moverCategoriaTarefa(id: string, direcao: "cima" | "baixo") {
  const todas = await prisma.categoriaTarefa.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true } });
  const idx = todas.findIndex((c) => c.id === id);
  const alvo = direcao === "cima" ? idx - 1 : idx + 1;
  if (idx < 0 || alvo < 0 || alvo >= todas.length) return;
  [todas[idx], todas[alvo]] = [todas[alvo], todas[idx]];
  await prisma.$transaction(todas.map((c, ordem) => prisma.categoriaTarefa.update({ where: { id: c.id }, data: { ordem: ordem + 1 } })));
}
