import "server-only";
import { prisma } from "@/lib/db";

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
