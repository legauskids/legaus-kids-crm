import { describe, expect, it } from "vitest";
import { destinoDaAlteracao, horarioValido, inicioDoPeriodo, versaoVigente } from "./compromissos";
import { diaDaSemana, inicioDaSemana, somarDias } from "./brasilia";

const iso = (d: Date) => d.toISOString();

describe("datas de Brasília", () => {
  it("semana de segunda a domingo", () => {
    expect(diaDaSemana("2026-09-30")).toBe(3); // quarta
    expect(inicioDaSemana("2026-09-30")).toBe("2026-09-28");
    expect(inicioDaSemana("2026-10-04")).toBe("2026-09-28"); // domingo ainda é a mesma semana
    expect(inicioDaSemana("2026-09-28")).toBe("2026-09-28");
    expect(somarDias("2026-09-30", 2)).toBe("2026-10-02");
  });
});

describe("inicioDoPeriodo", () => {
  it("dia e semana à meia-noite de Brasília, mesmo quando em UTC já é outro dia", () => {
    // quarta 30/09 às 22h em Brasília = quinta 01h UTC
    const quartaNoite = new Date("2026-09-30T22:00:00-03:00");
    expect(iso(inicioDoPeriodo("DIARIA", quartaNoite))).toBe("2026-09-30T03:00:00.000Z");
    expect(iso(inicioDoPeriodo("SEMANAL", quartaNoite))).toBe("2026-09-28T03:00:00.000Z");
  });
});

describe("versaoVigente", () => {
  const v1 = { id: "v1", vigenteDesde: new Date("2026-09-28T03:00:00Z") };
  const v2 = { id: "v2", vigenteDesde: new Date("2026-10-05T03:00:00Z") };
  it("pega a mais recente que já valia no início do período", () => {
    expect(versaoVigente([v2, v1], new Date("2026-10-01T03:00:00Z"))?.id).toBe("v1");
    expect(versaoVigente([v1, v2], new Date("2026-10-05T03:00:00Z"))?.id).toBe("v2");
    expect(versaoVigente([v1, v2], new Date("2026-09-21T03:00:00Z"))).toBeNull();
  });
});

describe("destinoDaAlteracao (mudar meta preserva o histórico)", () => {
  const agora = new Date("2026-10-07T15:00:00-03:00"); // quarta
  it("versão de outro período: cria nova valendo do início do período atual", () => {
    const versoes = [{ id: "v1", vigenteDesde: new Date("2026-09-28T03:00:00Z") }];
    expect(destinoDaAlteracao("SEMANAL", versoes, agora)).toEqual({ tipo: "criar", vigenteDesde: new Date("2026-10-05T03:00:00Z") });
    expect(destinoDaAlteracao("DIARIA", versoes, agora)).toEqual({ tipo: "criar", vigenteDesde: new Date("2026-10-07T03:00:00Z") });
  });
  it("versão que já começa no período atual: corrige no lugar", () => {
    const versoes = [
      { id: "v1", vigenteDesde: new Date("2026-09-28T03:00:00Z") },
      { id: "v2", vigenteDesde: new Date("2026-10-07T03:00:00Z") },
    ];
    expect(destinoDaAlteracao("DIARIA", versoes, agora)).toEqual({ tipo: "atualizar", id: "v2" });
  });
});

describe("horarioValido", () => {
  it("aceita HH:MM", () => {
    expect(horarioValido("19:00")).toBe(true);
    expect(horarioValido("7:00")).toBe(false);
    expect(horarioValido("24:00")).toBe(false);
    expect(horarioValido(null)).toBe(false);
  });
});
