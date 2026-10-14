// Texto que vai junto do PDF quando o orçamento é mandado pelo WhatsApp —
// pelo agente ou pelo botão da tela de Orçamentos. Pedido do Marcos de
// 2026-10-14: só o arquivo e a mensagem, sem o link do CRM.

import { centavosParaReais } from "./money";

export function textoEnvioOrcamentoWhatsApp(numero: number, totalCentavos: number): string {
  return (
    `Olá! Segue em anexo o orçamento *#${String(numero).padStart(4, "0")}* da Legaus Kids, ` +
    `no valor de ${centavosParaReais(Math.max(0, totalCentavos))}.\n\nQualquer dúvida, estamos à disposição!`
  );
}

/** Nome do arquivo do PDF do orçamento ("orcamento-0022.pdf"). */
export function nomeArquivoOrcamento(numero: number): string {
  return `orcamento-${String(numero).padStart(4, "0")}.pdf`;
}
