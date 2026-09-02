import "server-only";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { calcularPrecificacao } from "@/lib/utils/precificacao";
import { URL_BASE } from "@/lib/constants/app";

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

/**
 * Salva uma foto enviada por upload — redimensiona (largura máx. 1000px, o
 * bastante pra card/orçamento sem inchar o banco) e guarda os bytes direto
 * no Produto. imagemUrl vira a rota interna de servir essa imagem, pra tudo
 * que já lê imagemUrl (cards, orçamento, PDF) continuar funcionando sem
 * precisar saber que a foto agora é upload em vez de link externo.
 */
export async function atualizarFotoProduto(produtoId: string, arquivo: Buffer): Promise<string> {
  const redimensionado = await sharp(arquivo).rotate().resize({ width: 1000, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();

  await prisma.produto.update({
    where: { id: produtoId },
    data: {
      imagemBytes: new Uint8Array(redimensionado),
      imagemMime: "image/jpeg",
      imagemUrl: `${URL_BASE}/api/imagem/produto/${produtoId}`,
    },
  });
  return `${URL_BASE}/api/imagem/produto/${produtoId}`;
}

export function buscarFotoProduto(produtoId: string) {
  return prisma.produto.findUnique({ where: { id: produtoId }, select: { imagemBytes: true, imagemMime: true } });
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

/**
 * Aplica um valor a um campo pra todos os produtos de uma categoria de uma
 * vez ("aplicar a todos" da Lista de preços). Feito num único request com
 * updateMany + uma transação — chamar atualizarPrecoProduto em loop pra cada
 * item (uma linha, um request) estourava o pool de conexões do Neon com
 * categorias grandes (Linha Rotomoldados tem 88 produtos) e travava
 * silenciosamente no meio.
 */
export async function aplicarPrecoEmMassa(categoria: string, campo: CampoPrecoProduto, valor: number | null): Promise<number> {
  await prisma.produto.updateMany({ where: { categoria }, data: { [campo]: valor } });

  const produtos = await prisma.produto.findMany({
    where: { categoria },
    select: {
      id: true,
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

  const atualizacoes = produtos
    .map((p) => ({ id: p.id, ...calcularPrecificacao(p) }))
    .filter((p) => p.custoTotalUnitCentavos > 0);

  if (atualizacoes.length > 0) {
    await prisma.$transaction(
      atualizacoes.map((a) => prisma.produto.update({ where: { id: a.id }, data: { valorCentavos: a.precoVendaCentavos } })),
    );
  }

  return produtos.length;
}

export async function listarCategorias(): Promise<string[]> {
  const categorias = await prisma.produto.findMany({
    select: { categoria: true },
    distinct: ["categoria"],
    orderBy: { categoria: "asc" },
  });
  return categorias.map((c) => c.categoria);
}
