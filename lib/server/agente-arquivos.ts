import "server-only";
import { prisma } from "@/lib/db";
import { gerarCardProdutoBuffer } from "@/lib/server/produto-cards";

// Arquivo que o agente entrega pra QUEM PEDIU, no próprio canal da conversa
// (pedido de 2026-10-14). No Telegram não existe "o WhatsApp de quem pediu":
// "manda aqui pra eu ver" o orçamento caía no telefone do CLIENTE do
// orçamento — o PDF do #22 foi duas vezes pra cliente. Agora a ferramenta só
// anota o arquivo aqui e o adaptador do Telegram manda ele no chat.

export type ArquivoParaEnviar = { tipo: "orcamento-pdf"; orcamentoId: string } | { tipo: "card-produto"; produtoId: string; ocultarValor?: boolean };

export type ArquivoGerado = { bytes: Buffer; nome: string; mime: string; legenda?: string };

export async function gerarArquivoParaEnviar(arquivo: ArquivoParaEnviar): Promise<ArquivoGerado> {
  if (arquivo.tipo === "orcamento-pdf") {
    // Import dinâmico: o @react-pdf só carrega quando um PDF é gerado de verdade.
    const { gerarPdfOrcamento } = await import("@/lib/server/pdf/orcamento-pdf");
    const { buffer, nomeArquivo } = await gerarPdfOrcamento(arquivo.orcamentoId);
    return { bytes: buffer, nome: nomeArquivo, mime: "application/pdf" };
  }
  const produto = await prisma.produto.findUnique({ where: { id: arquivo.produtoId }, select: { nome: true } });
  const bytes = await gerarCardProdutoBuffer(arquivo.produtoId, { ocultarValor: arquivo.ocultarValor });
  return { bytes, nome: `${produto?.nome ?? "produto"}.jpg`, mime: "image/jpeg", legenda: produto?.nome };
}
