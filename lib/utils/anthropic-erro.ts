/**
 * Traduz um erro da API da Anthropic pra uma mensagem que faz sentido pro
 * Marcos ler no WhatsApp/CRM, em vez do JSON cru do erro. Detecção por
 * substring (não pelo shape da exceção do SDK) de propósito — o texto da
 * mensagem de erro da Anthropic é o único contrato estável entre versões
 * do SDK; o formato interno da exceção já mudou entre versões antes.
 *
 * Importante: uma chamada rejeitada por falta de crédito (erro 400,
 * invalid_request_error) NUNCA processa tokens — a Anthropic barra antes
 * de rodar o modelo. Ou seja, esses erros específicos não consomem crédito
 * nenhum; o problema é sempre a conta já estar zerada de uso legítimo
 * anterior, nunca as tentativas que falham depois disso.
 */
export function mensagemErroAnthropic(erro: unknown): string {
  const mensagem = erro instanceof Error ? erro.message : String(erro);

  if (mensagem.includes("credit balance is too low") || mensagem.includes("Plans & Billing")) {
    return "Agente de IA sem crédito na API da Anthropic no momento — acesse console.anthropic.com → Plans & Billing pra adicionar. Assim que adicionar, volta a funcionar sozinho, sem precisar reiniciar nada.";
  }
  if (mensagem.includes("rate_limit") || mensagem.toLowerCase().includes("rate limit")) {
    return "A API da IA está com limite de uso batido no momento — tenta de novo em alguns segundos.";
  }
  if (mensagem.includes("overloaded_error") || mensagem.includes("Overloaded")) {
    return "A API da IA está sobrecarregada no momento — tenta de novo em instantes.";
  }
  return "Não consegui falar com a IA agora — tenta de novo em instantes.";
}
