import "server-only";
import { prisma } from "@/lib/db";
import { calcularPrecificacao } from "@/lib/utils/precificacao";

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

export type CampoPrecoProduto =
  | "custoCompraCentavos"
  | "freteCustoCentavos"
  | "ipiCustoCentavos"
  | "outrosCustoCentavos"
  | "quantidadeReferencia"
  | "markupPercentual"
  | "impostoPercentual"
  | "instalacaoCentavos";

/**
 * Salva um campo da guia "Lista de preços" e recalcula o preço de venda
 * (valorCentavos) a partir do custo total + markup — mantém uma fonte única
 * de preço, já que o Orçamento lê valorCentavos direto.
 */
export async function atualizarPrecoProduto(produtoId: string, campo: CampoPrecoProduto, valor: number | null) {
  const atual = await prisma.produto.findUniqueOrThrow({
    where: { id: produtoId },
    select: {
      custoCompraCentavos: true,
      freteCustoCentavos: true,
      ipiCustoCentavos: true,
      outrosCustoCentavos: true,
      quantidadeReferencia: true,
      markupPercentual: true,
      impostoPercentual: true,
      instalacaoCentavos: true,
    },
  });

  const entrada = { ...atual, [campo]: valor };
  const { custoTotalUnitCentavos, precoVendaCentavos } = calcularPrecificacao(entrada);

  // Só recalcula o preço de venda quando já existe custo lançado — evita
  // zerar um valorCentavos existente ao editar um campo (ex: quantidade)
  // antes de preencher os custos da linha.
  return prisma.produto.update({
    where: { id: produtoId },
    data: custoTotalUnitCentavos > 0 ? { [campo]: valor, valorCentavos: precoVendaCentavos } : { [campo]: valor },
  });
}

export async function listarCategorias(): Promise<string[]> {
  const categorias = await prisma.produto.findMany({
    select: { categoria: true },
    distinct: ["categoria"],
    orderBy: { categoria: "asc" },
  });
  return categorias.map((c) => c.categoria);
}
