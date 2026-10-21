// O transcritor recebe uma lista de termos do negócio (o "prompt" de
// vocabulário). Com áudio mudo ou sem fala, o modelo devolve essa própria
// lista como se fosse o que foi dito — visto em 2026-10-21 no comando de voz
// do Marketing: "Legaus Kids, playground, parque infantil, ... Negócios: ..."
// chegou ao Claude como pedido. Pura e testável.

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A "transcrição" é o eco do vocabulário? Fala de verdade quase nunca tem mais que 3 ou 4 termos da lista. */
export function ehEcoDoVocabulario(transcricao: string, vocabulario: string): boolean {
  const texto = ` ${normalizar(transcricao)} `;
  if (!texto.trim()) return false;
  const termos = [...new Set(vocabulario.split(/[,.:]/).map(normalizar).filter((t) => t.length >= 3))];
  const presentes = termos.filter((t) => texto.includes(` ${t} `)).length;
  return presentes >= 8 || texto.includes(" negocios ") && presentes >= 5;
}
