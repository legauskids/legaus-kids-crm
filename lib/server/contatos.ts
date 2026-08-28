import "server-only";
import { prisma } from "@/lib/db";
import type { TipoContato } from "@prisma/client";

export function normalizarTelefone(telefone: string): string {
  return telefone.replace(/\D/g, "");
}

/** Usado pelo painel da extensão pra decidir entre a tela de "contato novo" e a de resumo. */
export function buscarContatoComNegociosPorTelefone(telefone: string) {
  return prisma.contato.findUnique({
    where: { telefone: normalizarTelefone(telefone) },
    include: {
      negocios: {
        include: { funil: true, etapa: true },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
}

/**
 * Cria o Contato se o telefone for novo; se já existir, só atualiza o nome
 * quando o registro atual ainda está com o telefone como nome (placeholder
 * de quando o contato surgiu de uma mensagem antes de ter nome salvo).
 */
export async function salvarContatoPorTelefone(input: {
  telefone: string;
  nome?: string;
  empresa?: string;
}) {
  const telefone = normalizarTelefone(input.telefone);
  const nome = input.nome?.trim();
  const empresa = input.empresa?.trim();

  const existente = await prisma.contato.findUnique({ where: { telefone } });
  if (existente) {
    const deveAtualizarNome = nome && existente.nome === existente.telefone;
    if (!deveAtualizarNome && !empresa) return existente;
    return prisma.contato.update({
      where: { id: existente.id },
      data: {
        nome: deveAtualizarNome ? nome : existente.nome,
        empresa: empresa || existente.empresa,
      },
    });
  }

  return prisma.contato.create({
    data: { telefone, nome: nome || telefone, empresa: empresa || null },
  });
}

/** Substitui a lista de etiquetas do contato (cria o contato se o telefone for novo). */
export async function definirTagsContato(telefone: string, tags: string[]) {
  const telefoneNormalizado = normalizarTelefone(telefone);
  const tagsLimpas = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];

  const existente = await prisma.contato.findUnique({ where: { telefone: telefoneNormalizado } });
  if (existente) {
    return prisma.contato.update({ where: { id: existente.id }, data: { tags: tagsLimpas } });
  }
  return prisma.contato.create({
    data: { telefone: telefoneNormalizado, nome: telefoneNormalizado, tags: tagsLimpas },
  });
}

/** Usado pela exportação CSV da extensão. */
export function listTodosContatosParaExportar() {
  return prisma.contato.findMany({
    select: { nome: true, telefone: true, empresa: true, tags: true },
    orderBy: { nome: "asc" },
  });
}

/** Lista para a aba Cadastros, com busca e filtro por tipo (contato/cliente/fornecedor). */
export function listarContatosParaPainel(tipo: TipoContato, busca?: string) {
  return prisma.contato.findMany({
    where: {
      tipo,
      ...(busca
        ? {
            OR: [
              { nome: { contains: busca, mode: "insensitive" } },
              { telefone: { contains: busca } },
              { empresa: { contains: busca, mode: "insensitive" } },
              { razaoSocial: { contains: busca, mode: "insensitive" } },
              { cnpj: { contains: busca } },
            ],
          }
        : {}),
    },
    include: { _count: { select: { negocios: true, conversas: true } } },
    orderBy: { nome: "asc" },
  });
}

export function buscarContatoPorId(contatoId: string) {
  return prisma.contato.findUnique({
    where: { id: contatoId },
    include: {
      negocios: { include: { funil: true, etapa: true }, orderBy: { updatedAt: "desc" } },
      conversas: { select: { id: true }, take: 1 },
    },
  });
}

export type AtualizarContatoInput = {
  nome?: string;
  empresa?: string | null;
  tags?: string[];
  cnpj?: string | null;
  razaoSocial?: string | null;
  inscricaoEstadual?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  telefone?: string | null;
};

export function atualizarContato(contatoId: string, input: AtualizarContatoInput) {
  const { telefone, ...resto } = input;
  return prisma.contato.update({
    where: { id: contatoId },
    data: { ...resto, telefone: telefone ? normalizarTelefone(telefone) : telefone },
  });
}

export type CriarContatoInput = {
  nome: string;
  telefone?: string | null;
  empresa?: string | null;
  tipo: TipoContato;
  cnpj?: string | null;
  razaoSocial?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
};

export function criarContato(input: CriarContatoInput) {
  return prisma.contato.create({
    data: {
      nome: input.nome,
      telefone: input.telefone ? normalizarTelefone(input.telefone) : null,
      empresa: input.empresa || null,
      tipo: input.tipo,
      cnpj: input.cnpj || null,
      razaoSocial: input.razaoSocial || null,
      endereco: input.endereco || null,
      cidade: input.cidade || null,
      uf: input.uf || null,
      cep: input.cep || null,
    },
  });
}

export function excluirContato(contatoId: string) {
  return prisma.contato.delete({ where: { id: contatoId } });
}

/** Pra combo "cliente" em telas como Orçamento — todos os tipos, busca leve. */
export function listarContatosParaCombo(busca?: string) {
  return prisma.contato.findMany({
    where: busca
      ? {
          OR: [
            { nome: { contains: busca, mode: "insensitive" } },
            { razaoSocial: { contains: busca, mode: "insensitive" } },
          ],
        }
      : undefined,
    select: { id: true, nome: true, empresa: true, razaoSocial: true, tipo: true },
    orderBy: { nome: "asc" },
    take: 50,
  });
}
