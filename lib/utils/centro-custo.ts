// Sugestão de centro de custo pela descrição do lançamento do extrato
// ("TARIFA PACOTE SERVICOS" -> Tarifas bancárias). É só SUGESTÃO na tela de
// conciliação — quem confirma é o usuário (atribuir despesa ao centro errado
// distorce o dashboard financeiro sem ninguém perceber).

const REGEX_DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");

/** Maiúsculas, sem acento, só letras/números separados por um espaço. */
export function normalizarDescricao(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(REGEX_DIACRITICOS, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

type CentroComPalavras = { id: string; tipo: "DESPESA" | "RECEITA"; palavrasChave: string[] };

/**
 * Centro de custo cujas palavras-chave aparecem na descrição como palavra ou
 * expressão INTEIRA ("DAS" casa com "PAGTO DAS 09/2026", não com "VENDAS").
 * Saída só casa centro de DESPESA e entrada só de RECEITA. Havendo mais de um,
 * vence a palavra-chave mais longa (mais específica).
 */
export function sugerirCentroCusto<T extends CentroComPalavras>(
  descricao: string,
  tipoTransacao: "ENTRADA" | "SAIDA",
  centros: T[],
): T | null {
  const texto = ` ${normalizarDescricao(descricao)} `;
  const tipoCentro = tipoTransacao === "SAIDA" ? "DESPESA" : "RECEITA";
  let melhor: { centro: T; tamanho: number } | null = null;
  for (const centro of centros) {
    if (centro.tipo !== tipoCentro) continue;
    for (const palavra of centro.palavrasChave) {
      const chave = normalizarDescricao(palavra);
      if (!chave) continue;
      if (texto.includes(` ${chave} `) && (!melhor || chave.length > melhor.tamanho)) {
        melhor = { centro, tamanho: chave.length };
      }
    }
  }
  return melhor?.centro ?? null;
}
