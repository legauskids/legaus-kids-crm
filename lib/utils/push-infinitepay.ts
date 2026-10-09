// Leitura da notificação (push) do app da InfinitePay, encaminhada pelo
// MacroDroid (pedido de 2026-10-08). Pura e testável. As duas contas
// (Legaus e Idezza) ficam no mesmo app e a notificação não diz de qual é —
// decisão do Marcos: tudo no mesmo Financeiro, com a etiqueta "InfinitePay".
//
// Padrão confirmado pelo Marcos (print de 08/10/2026):
//   título: "Pix recebido de R$ 0,01! 💰✅"
//   texto:  "Você recebeu um Pix de MARCOS ZANCAN na sua conta InfinitePay!
//            Clique para conferir seu saldo. 👆"
// Não traz data nem hora: vale a hora em que chegou. Os outros tipos (Pix
// enviado, venda no cartão) ainda não foram vistos — a leitura é tolerante
// pelas palavras de sempre e é ajustada quando chegar o primeiro de verdade.

import type { PushLido } from "./push-sicredi";

const VALOR = /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/;

function centavos(valor: string): number {
  return Number(valor.replace(/\./g, "").replace(",", ""));
}

/** "MARCOS ZANCAN" -> "Marcos Zancan" (nome todo em maiúsculas fica difícil de ler). */
function semCaixaAlta(nome: string): string {
  if (nome !== nome.toUpperCase()) return nome;
  return nome.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, borda: string, letra: string) => borda + letra.toUpperCase());
}

export function lerPushInfinitePay(titulo: string | null | undefined, texto: string | null | undefined): PushLido | null {
  const tudo = `${titulo ?? ""}\n${texto ?? ""}`.replace(/\r/g, "");
  const valor = tudo.match(VALOR);
  if (!valor) return null;

  // Venda no cartão também é entrada; "débito"/"crédito" sozinhos não decidem
  // (venda no débito é dinheiro entrando).
  const direcao = /\b(recebeu|recebido|recebida|venda|vendeu|vendido|aprovad[ao])\b/i.test(tudo)
    ? "ENTRADA"
    : /\b(enviou|enviado|pagou|pago|pagamento|transferiu|transfer[eê]ncia enviada|saque|sacou)\b/i.test(tudo)
      ? "SAIDA"
      : null;
  if (!direcao) return null;

  const quem =
    tudo.match(/\bPix de (.+?) na sua conta\b/i) ??
    tudo.match(/\bPix para (.+?)(?: na sua conta| com| foi|[.!]|\n|$)/i) ??
    tudo.match(/\b(?:de|para) ([^\n!.]+?) na sua conta\b/i);

  return {
    direcao,
    valorCentavos: centavos(valor[1]),
    contraparte: quem ? semCaixaAlta(quem[1].trim()) : null,
    documento: null,
    banco: null,
    mensagem: null,
    dataHora: null,
    meio: /\bpix\b/i.test(tudo) ? "PIX" : "OUTRO",
  };
}
