import { describe, expect, it } from "vitest";
import { negocioParado, negociosComTarefaAtiva } from "./dates";

const diasAtras = (n: number) => new Date(Date.now() - n * 86400e3);

describe("negocioParado (regra de 2026-10-20)", () => {
  it("passou do prazo da etapa e sem tarefa ativa: parado", () => {
    expect(negocioParado({ slaDias: 5, dataEntradaNaEtapa: diasAtras(10), temTarefaAtiva: false })).toBe(true);
  });
  it("com tarefa ativa não conta como parado, mesmo passado do prazo", () => {
    expect(negocioParado({ slaDias: 5, dataEntradaNaEtapa: diasAtras(10), temTarefaAtiva: true })).toBe(false);
  });
  it("dentro do prazo ou etapa sem prazo: não está parado", () => {
    expect(negocioParado({ slaDias: 5, dataEntradaNaEtapa: diasAtras(2), temTarefaAtiva: false })).toBe(false);
    expect(negocioParado({ slaDias: null, dataEntradaNaEtapa: diasAtras(90), temTarefaAtiva: false })).toBe(false);
  });
});

describe("negociosComTarefaAtiva", () => {
  const negocios = [
    { id: "n1", contatoId: "c1" },
    { id: "n2", contatoId: "c2" },
    { id: "n3", contatoId: "c3" },
    { id: "n4", contatoId: null },
  ];
  it("tarefa do negócio ou só do cliente dele conta; tarefa de outro negócio do cliente não", () => {
    const r = negociosComTarefaAtiva(negocios, [
      { negocioId: "n1", contatoId: null },
      { negocioId: null, contatoId: "c2" },
      { negocioId: "outro", contatoId: "c3" },
    ]);
    expect([...r].sort()).toEqual(["n1", "n2"]);
  });
});
