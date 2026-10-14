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
