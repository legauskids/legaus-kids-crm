import "server-only";
import { prisma } from "@/lib/db";

// Categorias que sempre aparecem na aba Produtos, mesmo sem nenhum item
// cadastrado ainda — assim dá pra criar produto ali direto. As 10 primeiras
// vêm do catálogo público (legauskids.com.br); Pedagógicos foi pedida à
// parte, pra itens que não estão no site.
export const CATEGORIAS_FIXAS = [
  "Playground",
  "Parque Infantil",
  "Parque Infantil Baby",
  "Parque Infantil PNE",
  "Kidplay",
  "Pisos",
  "Academia Aberta",
  "Mobiliário",
  "Outros Produtos",
  "Linha Rotomoldados",
  "Pedagógicos",
];

export function listarProdutosAgrupados() {
  return prisma.produto.findMany({ orderBy: [{ categoria: "asc" }, { nome: "asc" }] });
}

export type CriarProdutoInput = {
  nome: string;
  codigo?: string | null;
  categoria: string;
  descricao?: string | null;
  imagemUrl?: string | null;
  valorCentavos?: number | null;
};

export function criarProduto(input: CriarProdutoInput) {
  return prisma.produto.create({ data: input });
}

export type AtualizarProdutoInput = {
  nome?: string;
  codigo?: string | null;
  categoria?: string;
  descricao?: string | null;
  imagemUrl?: string | null;
  valorCentavos?: number | null;
  ativo?: boolean;
};

export function atualizarProduto(produtoId: string, input: AtualizarProdutoInput) {
  return prisma.produto.update({ where: { id: produtoId }, data: input });
}

export function excluirProduto(produtoId: string) {
  return prisma.produto.delete({ where: { id: produtoId } });
}

export async function listarCategorias(): Promise<string[]> {
  const categorias = await prisma.produto.findMany({
    select: { categoria: true },
    distinct: ["categoria"],
    orderBy: { categoria: "asc" },
  });
  return categorias.map((c) => c.categoria);
}
