// Regras que separam CONVERSA da equipe de COMANDO pro agente (pedido do
// Marcos em 2026-09-28). O número da Legaus Kids também é usado pra conversa
// entre a equipe — mandar pedido de cliente pro Marcos ou pra Dani, recados —
// e isso não pode virar comando.

/**
 * Menção a alguém da equipe ("@marcos", "@Dani", "@daniela") = recado pra
 * pessoa, não pedido pro agente. Não casa com e-mail (fulano@dani.com) nem
 * com nome maior ("@danilo").
 */
const MENCAO_EQUIPE = /(^|[^\w@.])@(marcos|dani|daniela)(?![\w@])/i;

export function mencionaAlguemDaEquipe(texto) {
  return !!texto && MENCAO_EQUIPE.test(texto);
}

/**
 * Por que uma mensagem NÃO é comando, mesmo vindo de/para um número
 * autorizado — ou null quando ela segue pras outras checagens.
 *
 * - `fromMe` fora do "Mensagens para mim": mensagem que SAI do número da
 *   Legaus pra outra conversa (Marcos, Dani, cliente) nunca é comando. O
 *   único comando que sai do próprio número é o do "Mensagens para mim".
 * - Menção @marcos/@dani no texto ou na legenda: recado pra equipe.
 */
export function motivoParaNaoSerComando({ fromMe, conversaPropria, texto }) {
  if (fromMe && !conversaPropria) return "saiu do número da Legaus para outra conversa";
  if (mencionaAlguemDaEquipe(texto)) return "menciona alguém da equipe (@)";
  return null;
}
