import { describe, expect, it } from "vitest";
import { normalizarDescricao, sugerirCentroCusto } from "./centro-custo";

const centros = [
  { id: "impostos", tipo: "DESPESA" as const, palavrasChave: ["DAS", "SIMPLES NACIONAL", "DARF"] },
  { id: "tarifas", tipo: "DESPESA" as const, palavrasChave: ["TARIFA", "IOF"] },
  { id: "combustivel", tipo: "DESPESA" as const, palavrasChave: ["POSTO", "COMBUSTÍVEL"] },
  { id: "outras-receitas", tipo: "RECEITA" as const, palavrasChave: ["RENDIMENTO"] },
];

describe("normalizarDescricao", () => {
  it("tira acento, pontuação e deixa maiúsculo", () => {
    expect(normalizarDescricao("Pagto. Tarifa - Serviços/09")).toBe("PAGTO TARIFA SERVICOS 09");
  });
});

describe("sugerirCentroCusto", () => {
  it("casa palavra inteira, sem acento nem maiúscula", () => {
    expect(sugerirCentroCusto("PAGTO DAS 09/2026", "SAIDA", centros)?.id).toBe("impostos");
    expect(sugerirCentroCusto("Tarifa pacote serviços", "SAIDA", centros)?.id).toBe("tarifas");
    expect(sugerirCentroCusto("Posto Ipiranga Santa Rosa", "SAIDA", centros)?.id).toBe("combustivel");
  });

  it("não casa pedaço de palavra", () => {
    expect(sugerirCentroCusto("PIX RECEBIDO VENDAS ONLINE", "SAIDA", centros)).toBeNull();
    expect(sugerirCentroCusto("COMPOSTO QUIMICO LTDA", "SAIDA", centros)).toBeNull();
  });

  it("saída só sugere despesa e entrada só receita", () => {
    expect(sugerirCentroCusto("RENDIMENTO POUPANCA", "SAIDA", centros)).toBeNull();
    expect(sugerirCentroCusto("RENDIMENTO POUPANCA", "ENTRADA", centros)?.id).toBe("outras-receitas");
  });

  it("expressão de várias palavras funciona", () => {
    expect(sugerirCentroCusto("GUIA SIMPLES NACIONAL", "SAIDA", centros)?.id).toBe("impostos");
  });

  it("sem palavra-chave conhecida devolve null", () => {
    expect(sugerirCentroCusto("PIX ENVIADO JOAO DA SILVA", "SAIDA", centros)).toBeNull();
  });
});
