// Texto que vai junto do PDF quando o orçamento é mandado pelo WhatsApp —
// pelo agente ou pelo botão da tela de Orçamentos. Pedido do Marcos de
// 2026-10-14: só o arquivo e a mensagem, sem o link do CRM. Pedido de
// 2026-11-17: sem o valor na mensagem (o valor fica só no PDF).

export function textoEnvioOrcamentoWhatsApp(numero: number): string {
  return `Olá! Segue em anexo o orçamento *#${String(numero).padStart(4, "0")}* da Legaus Kids.\n\nQualquer dúvida, estamos à disposição!`;
}

/** Nome do arquivo do PDF do orçamento ("orcamento-0022.pdf"). */
export function nomeArquivoOrcamento(numero: number): string {
  return `orcamento-${String(numero).padStart(4, "0")}.pdf`;
}
