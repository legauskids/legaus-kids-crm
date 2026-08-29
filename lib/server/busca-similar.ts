import "server-only";
import { prisma } from "@/lib/db";

// Busca "tipo Google" pro agente de IA — usa trigram (pg_trgm) do Postgres
// pra tolerar erro de digitação, falta de hífen/espaço etc (ex: "PL010"
// acha "Playground PL-010"). Combina com ILIKE de substring pra não perder
// os casos óbvios que a similaridade por trigram às vezes pontua baixo em
// termos curtos.
const LIMIAR_SIMILARIDADE = 0.15;

export type ClienteSimilar = {
  id: string;
  nome: string;
  razaoSocial: string | null;
  telefone: string | null;
  email: string | null;
  tipo: string;
};

export async function buscarClientesSimilar(termo: string, limite = 8): Promise<ClienteSimilar[]> {
  const curinga = `%${termo}%`;
  return prisma.$queryRaw<ClienteSimilar[]>`
    SELECT id, nome, "razaoSocial", telefone, email, tipo
    FROM "Contato"
    WHERE similarity(nome, ${termo}) > ${LIMIAR_SIMILARIDADE}
       OR similarity(COALESCE("razaoSocial", ''), ${termo}) > ${LIMIAR_SIMILARIDADE}
       OR nome ILIKE ${curinga}
       OR "razaoSocial" ILIKE ${curinga}
    ORDER BY GREATEST(similarity(nome, ${termo}), similarity(COALESCE("razaoSocial", ''), ${termo})) DESC
    LIMIT ${limite}
  `;
}

export type ProdutoSimilar = {
  id: string;
  nome: string;
  codigo: string | null;
  categoria: string;
  valorCentavos: number | null;
};

export async function buscarProdutosSimilar(termo: string, limite = 8): Promise<ProdutoSimilar[]> {
  const curinga = `%${termo}%`;
  return prisma.$queryRaw<ProdutoSimilar[]>`
    SELECT id, nome, codigo, categoria, "valorCentavos"
    FROM "Produto"
    WHERE ativo = true
      AND (
        similarity(nome, ${termo}) > ${LIMIAR_SIMILARIDADE}
        OR similarity(COALESCE(codigo, ''), ${termo}) > ${LIMIAR_SIMILARIDADE}
        OR nome ILIKE ${curinga}
        OR codigo ILIKE ${curinga}
      )
    ORDER BY GREATEST(similarity(nome, ${termo}), similarity(COALESCE(codigo, ''), ${termo})) DESC
    LIMIT ${limite}
  `;
}

export type NegocioSimilar = { id: string };

export async function buscarNegociosSimilarIds(termo: string, limite = 8): Promise<string[]> {
  const curinga = `%${termo}%`;
  const linhas = await prisma.$queryRaw<NegocioSimilar[]>`
    SELECT n.id
    FROM "Negocio" n
    LEFT JOIN "Contato" c ON c.id = n."contatoId"
    WHERE similarity(n.titulo, ${termo}) > ${LIMIAR_SIMILARIDADE}
       OR similarity(COALESCE(c.nome, ''), ${termo}) > ${LIMIAR_SIMILARIDADE}
       OR n.titulo ILIKE ${curinga}
       OR c.nome ILIKE ${curinga}
    ORDER BY GREATEST(similarity(n.titulo, ${termo}), similarity(COALESCE(c.nome, ''), ${termo})) DESC
    LIMIT ${limite}
  `;
  return linhas.map((l) => l.id);
}

export type TarefaSimilar = { id: string };

export async function buscarTarefasSimilarIds(termo: string, limite = 8): Promise<string[]> {
  const curinga = `%${termo}%`;
  const linhas = await prisma.$queryRaw<TarefaSimilar[]>`
    SELECT id
    FROM "Tarefa"
    WHERE similarity(titulo, ${termo}) > ${LIMIAR_SIMILARIDADE}
       OR titulo ILIKE ${curinga}
    ORDER BY similarity(titulo, ${termo}) DESC
    LIMIT ${limite}
  `;
  return linhas.map((l) => l.id);
}
