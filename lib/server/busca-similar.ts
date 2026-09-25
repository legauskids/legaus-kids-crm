import "server-only";
import { prisma } from "@/lib/db";
import { mesmoTelefone, partesTelefone } from "@/lib/utils/telefone";

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

/**
 * Busca contato pelo telefone em qualquer formato (com/sem 55, com/sem o 9
 * extra, com/sem máscara) — ver lib/utils/telefone.ts. Pré-filtra no banco
 * pelos 8 dígitos finais e confirma DDD em memória. Pedido de 2026-09-25:
 * na rotina de prospecção o Marcos cola um número no WhatsApp e pergunta
 * "esse contato já está salvo?", e o agente só sabia buscar por nome.
 */
export async function buscarClientesPorTelefone(telefone: string, limite = 8): Promise<ClienteSimilar[]> {
  const partes = partesTelefone(telefone);
  if (!partes) return [];
  const candidatos = await prisma.contato.findMany({
    where: { telefone: { endsWith: partes.final8 } },
    select: { id: true, nome: true, razaoSocial: true, telefone: true, email: true, tipo: true },
    take: 50,
  });
  return candidatos.filter((c) => c.telefone && mesmoTelefone(c.telefone, telefone)).slice(0, limite);
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
  // Além de nome/código (similaridade + ILIKE), também casa por trecho da
  // descrição — visto ao vivo em 2026-09-05: buscar "duas torres" não
  // achava nada porque isso só existe na descrição do produto, nunca no
  // nome/código. Descrição usa só ILIKE (não similarity()): é um campo
  // longo, e trigram similarity contra um termo curto tende a dar score
  // baixo mesmo quando o termo aparece de verdade no meio do texto —
  // ILIKE (contém) é o critério certo aqui, diferente de nome/código onde
  // tolerar erro de digitação importa mais que "contém exatamente".
  return prisma.$queryRaw<ProdutoSimilar[]>`
    SELECT id, nome, codigo, categoria, "valorCentavos"
    FROM "Produto"
    WHERE ativo = true
      AND (
        similarity(nome, ${termo}) > ${LIMIAR_SIMILARIDADE}
        OR similarity(COALESCE(codigo, ''), ${termo}) > ${LIMIAR_SIMILARIDADE}
        OR nome ILIKE ${curinga}
        OR codigo ILIKE ${curinga}
        OR descricao ILIKE ${curinga}
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

// Cotacao ainda não tem índice trigram (tabela nova, poucas linhas por
// enquanto) — ILIKE simples já cobre bem o volume atual.
export type CotacaoSimilar = { id: string; numero: number; titulo: string; tipo: string };

export async function buscarCotacoesSimilar(termo: string, limite = 8): Promise<CotacaoSimilar[]> {
  return prisma.cotacao.findMany({
    where: { titulo: { contains: termo, mode: "insensitive" } },
    select: { id: true, numero: true, titulo: true, tipo: true },
    orderBy: { criadoEm: "desc" },
    take: limite,
  });
}

export type ContratoSimilar = { id: string };

/** Busca contrato pelo título do negócio ou nome do cliente vinculado. */
export async function buscarContratosSimilarIds(termo: string, limite = 8): Promise<string[]> {
  const curinga = `%${termo}%`;
  const linhas = await prisma.$queryRaw<ContratoSimilar[]>`
    SELECT co.id
    FROM "Contrato" co
    JOIN "Negocio" n ON n.id = co."negocioId"
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
