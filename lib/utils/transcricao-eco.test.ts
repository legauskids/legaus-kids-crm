import { describe, expect, it } from "vitest";
import { ehEcoDoVocabulario } from "./transcricao-eco";

const VOCAB =
  "Legaus Kids, playground, parque infantil, kidplay, orçamento, negócio, PL-010, PL-018, Apromes, WhatsApp, lista de preços, markup, etapa, funil, despesa, combustível, posto, madeireira, categoria, centro de custo, Veículos, Produção, Instalação, Administrativo, Marketing, reais. Negócios: Kidplay - Bobs Vacaria, Zé Batata, Brinquedos Senador.";

describe("ehEcoDoVocabulario (áudio mudo, 21/10)", () => {
  it("a lista devolvida como transcrição é eco", () => {
    expect(ehEcoDoVocabulario("Legaus Kids, playground, parque infantil, kidplay, orçamento, negócio, PL-010, PL-018, Apromes, WhatsApp, lista de preços, markup, etapa.", VOCAB)).toBe(true);
    expect(ehEcoDoVocabulario("Negócios: Kidplay - Bobs Vacaria, Zé Batata, Brinquedos Senador, playground, orçamento.", VOCAB)).toBe(true);
  });
  it("fala de verdade com alguns termos do negócio não é eco", () => {
    expect(ehEcoDoVocabulario("Aumenta a logo da capa para 420 de largura.", VOCAB)).toBe(false);
    expect(ehEcoDoVocabulario("Gastei 250 de combustível no posto pro negócio do Kidplay, categoria veículos.", VOCAB)).toBe(false);
    expect(ehEcoDoVocabulario("Manda o orçamento do playground PL-010 pro WhatsApp da Renata.", VOCAB)).toBe(false);
    expect(ehEcoDoVocabulario("", VOCAB)).toBe(false);
  });
});
