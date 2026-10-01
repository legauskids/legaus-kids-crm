import { describe, expect, it } from "vitest";
import { agruparMotivos, agruparPorMes, mesDoFechamento, type NegocioFechado } from "./historico-negocios";

const b = (s: string) => new Date(`${s.replace(" ", "T")}:00-03:00`);
let seq = 0;
function negocio(tipo: "GANHO" | "PERDIDO", quando: string, valor: number, motivo: string | null = null): NegocioFechado {
  return { id: `n${++seq}`, titulo: `Negócio ${seq}`, contatoNome: null, responsavelNome: "Marcos", valorCentavos: valor, tipo, data: b(quando), motivoPerda: motivo };
}

describe("mesDoFechamento", () => {
  it("usa o mês de Brasília (30/09 às 22h já é 01/10 em UTC)", () => {
    expect(mesDoFechamento(b("2026-09-30 22:00"))).toBe("2026-09");
    expect(mesDoFechamento(b("2026-10-01 00:30"))).toBe("2026-10");
  });
});

describe("agruparPorMes", () => {
  const lista = [
    negocio("GANHO", "2026-09-10 10:00", 1000000),
    negocio("GANHO", "2026-09-25 10:00", 3000000),
    negocio("PERDIDO", "2026-09-12 10:00", 500000, "Preço"),
    negocio("PERDIDO", "2026-08-05 10:00", 200000, "preço "),
    negocio("GANHO", "2026-10-01 09:00", 700000),
  ];
  const meses = agruparPorMes(lista, "2026-10");

  it("mais recente primeiro, com o mês atual marcado", () => {
    expect(meses.map((m) => m.mes)).toEqual(["2026-10", "2026-09", "2026-08"]);
    expect(meses[0]).toMatchObject({ atual: true, rotulo: "outubro de 2026" });
    expect(meses[1].atual).toBe(false);
  });

  it("totais, conversão, ticket médio e negócios mais recentes primeiro", () => {
    const setembro = meses[1];
    expect(setembro.ganhos).toMatchObject({ qtd: 2, valorCentavos: 4000000 });
    expect(setembro.perdidos).toMatchObject({ qtd: 1, valorCentavos: 500000 });
    expect(setembro.conversao).toBeCloseTo(2 / 3);
    expect(setembro.ticketMedioCentavos).toBe(2000000);
    expect(setembro.ganhos.itens[0].data.getTime()).toBeGreaterThan(setembro.ganhos.itens[1].data.getTime());
    expect(meses[2]).toMatchObject({ conversao: 0, ticketMedioCentavos: null });
  });
});

describe("agruparMotivos", () => {
  it("junta motivos iguais ignorando maiúscula e espaços; vazio vira 'sem motivo'", () => {
    const perdidos = [
      negocio("PERDIDO", "2026-09-01 10:00", 1, "Preço"),
      negocio("PERDIDO", "2026-09-02 10:00", 1, " preço"),
      negocio("PERDIDO", "2026-09-03 10:00", 1, null),
    ];
    expect(agruparMotivos(perdidos)).toEqual([
      { motivo: "Preço", qtd: 2 },
      { motivo: "Sem motivo registrado", qtd: 1 },
    ]);
  });
});
