// Envio de um produto do catálogo pelo WhatsApp, em card (imagem) ou PDF
// (ficha do produto) — pedido do Marcos de 2026-10-14. Puro e testável.

import { centavosParaReais } from "./money";

export type FormatoEnvioProduto = "CARD" | "PDF";

/** Texto que vai junto do arquivo: o que a pessoa escreveu ou o padrão (com o preço, se não estiver oculto). */
export function textoEnvioProduto(
  produto: { nome: string; valorCentavos: number | null },
  formato: FormatoEnvioProduto,
  ocultarValor: boolean,
  mensagem?: string | null,
): string {
  if (mensagem?.trim()) return mensagem.trim();
  const preco = !ocultarValor && produto.valorCentavos != null ? ` — ${centavosParaReais(produto.valorCentavos)}` : "";
  return formato === "PDF" ? `Segue a ficha do produto *${produto.nome}*${preco}.` : `*${produto.nome}*${preco}`;
}

/** "Kidplay Loja" -> "kidplay-loja.pdf" / ".jpg". */
export function nomeArquivoProduto(nome: string, formato: FormatoEnvioProduto): string {
  const base =
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "produto";
  return `${base}.${formato === "PDF" ? "pdf" : "jpg"}`;
}

/** Rota interna do arquivo (card: imagem pública; PDF: precisa de login ou do token do whatsapp-service). */
export function caminhoArquivoProduto(produtoId: string, formato: FormatoEnvioProduto, ocultarValor: boolean): string {
  const base = formato === "PDF" ? `/api/pdf/produto/${produtoId}` : `/api/imagem/produto-card/${produtoId}`;
  return ocultarValor ? `${base}?ocultarValor=1` : base;
}

// Vários produtos num PDF só (pedido de 2026-10-15): um produto por página.
export const LIMITE_PRODUTOS_PDF = 30;
export const NOME_ARQUIVO_PRODUTOS = "produtos-legaus-kids.pdf";

/** Texto padrão do PDF com vários produtos: quantos e os primeiros nomes. */
export function textoEnvioProdutos(produtos: { nome: string }[], mensagem?: string | null): string {
  if (mensagem?.trim()) return mensagem.trim();
  if (produtos.length === 1) return `Segue a ficha do produto *${produtos[0].nome}*.`;
  const nomes = produtos.slice(0, 5).map((p) => p.nome);
  const resto = produtos.length - nomes.length;
  const lista = resto > 0 ? `${nomes.join(", ")} e mais ${resto}` : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
  return `Segue o PDF com ${produtos.length} produtos da Legaus Kids: ${lista}.`;
}

/** Rota do PDF com vários produtos (na ordem escolhida). */
export function caminhoArquivoProdutos(produtoIds: string[], ocultarValor: boolean): string {
  const ids = encodeURIComponent(produtoIds.join(","));
  return `/api/pdf/produtos?ids=${ids}${ocultarValor ? "&ocultarValor=1" : ""}`;
}
