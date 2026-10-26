import { describe, expect, it } from "vitest";
import { dataHoraDoFormulario, valorDataHoraBrasilia } from "./data-hora";

describe("dataHoraDoFormulario", () => {
  it("valor do datetime-local é horário de Brasília, qualquer que seja o fuso do servidor", () => {
    expect(dataHoraDoFormulario("2026-09-29T14:00").toISOString()).toBe("2026-09-29T17:00:00.000Z");
    expect(dataHoraDoFormulario("2026-09-29T14:00:30").toISOString()).toBe("2026-09-29T17:00:30.000Z");
    // 22h em Brasília já é o dia seguinte em UTC
    expect(dataHoraDoFormulario("2026-09-29T22:30").toISOString()).toBe("2026-09-30T01:30:00.000Z");
  });

  it("valor com fuso passa direto", () => {
    expect(dataHoraDoFormulario("2026-09-29T17:00:00.000Z").toISOString()).toBe("2026-09-29T17:00:00.000Z");
    expect(dataHoraDoFormulario("2026-09-29T14:00:00-03:00").toISOString()).toBe("2026-09-29T17:00:00.000Z");
  });

  it("recusa valor inválido em vez de gravar data quebrada", () => {
    expect(() => dataHoraDoFormulario("amanhã")).toThrow("Data/hora inválida.");
  });
});

describe("valorDataHoraBrasilia", () => {
  it("mostra no campo o horário de Brasília e volta igual pelo dataHoraDoFormulario", () => {
    expect(valorDataHoraBrasilia(new Date("2026-09-30T01:30:00.000Z"))).toBe("2026-09-29T22:30");
    expect(dataHoraDoFormulario(valorDataHoraBrasilia(new Date("2026-10-27T12:00:00.000Z"))).toISOString()).toBe("2026-10-27T12:00:00.000Z");
  });
});
