import { describe, expect, it } from "vitest";
import { finalDeTelefone, mesmoTelefone, pareceTelefone, partesTelefone, telefoneLegivel, telefonePadraoBR } from "./telefone";

describe("partesTelefone", () => {
  it("separa DDD e 8 finais em vários formatos", () => {
    expect(partesTelefone("(51) 99771-5704")).toEqual({ ddd: "51", final8: "97715704" });
    expect(partesTelefone("+55 51 99771-5704")).toEqual({ ddd: "51", final8: "97715704" });
    expect(partesTelefone("555184370956")).toEqual({ ddd: "51", final8: "84370956" });
    expect(partesTelefone("5555999603257")).toEqual({ ddd: "55", final8: "99603257" });
    expect(partesTelefone("99771-5704")).toEqual({ ddd: null, final8: "97715704" });
  });

  it("devolve null com poucos dígitos", () => {
    expect(partesTelefone("1234")).toBeNull();
    expect(partesTelefone("")).toBeNull();
  });
});

describe("mesmoTelefone", () => {
  it("casa com e sem 55, com e sem o 9 extra, com e sem máscara", () => {
    expect(mesmoTelefone("555584370956", "(55) 98437-0956")).toBe(true);
    expect(mesmoTelefone("5555999603257", "555599603257")).toBe(true);
    expect(mesmoTelefone("51997715704", "+55 (51) 99771-5704")).toBe(true);
  });

  it("sem DDD de um lado, compara só os 8 finais", () => {
    expect(mesmoTelefone("99771-5704", "5551997715704")).toBe(true);
  });

  it("DDD diferente não é o mesmo número", () => {
    expect(mesmoTelefone("(51) 99771-5704", "(54) 99771-5704")).toBe(false);
  });

  it("finais diferentes não são o mesmo número", () => {
    expect(mesmoTelefone("(51) 99771-5704", "(51) 99771-5705")).toBe(false);
  });
});

describe("pareceTelefone", () => {
  it("reconhece telefone e rejeita nome ou texto", () => {
    expect(pareceTelefone("(51) 99771-5704")).toBe(true);
    expect(pareceTelefone("555584370956")).toBe(true);
    expect(pareceTelefone("Vagner São Borja")).toBe(false);
    expect(pareceTelefone("Apromes 2024")).toBe(false);
    expect(pareceTelefone("123")).toBe(false);
  });
});

describe("finalDeTelefone (busca pelos últimos dígitos, 2026-10-16)", () => {
  it("aceita de 4 a 7 dígitos", () => {
    expect(finalDeTelefone("6980")).toBe("6980");
    expect(finalDeTelefone(" 2-6980 ")).toBe("26980");
    expect(finalDeTelefone("1126980")).toBe("1126980");
  });
  it("número inteiro, pouco dígito ou texto não é final", () => {
    expect(finalDeTelefone("91126980")).toBeNull();
    expect(finalDeTelefone("555591126980")).toBeNull();
    expect(finalDeTelefone("698")).toBeNull();
    expect(finalDeTelefone("Ana 6980")).toBeNull();
    expect(finalDeTelefone("PL-003")).toBeNull();
  });
});

describe("telefonePadraoBR e telefoneLegivel (padrão com o 9, 2026-10-14)", () => {
  it("celular ganha o 9 e o 55", () => {
    expect(telefonePadraoBR("54 9696-0296")).toBe("5554996960296");
    expect(telefonePadraoBR("555596356217")).toBe("5555996356217");
    expect(telefonePadraoBR("(51) 99771-5704")).toBe("5551997715704");
    expect(telefonePadraoBR("5555999603257")).toBe("5555999603257");
  });
  it("fixo, sem DDD e estrangeiro não ganham 9", () => {
    expect(telefonePadraoBR("(55) 3512-1234")).toBe("555535121234");
    expect(telefonePadraoBR("9696-0296")).toBe("96960296");
    expect(telefonePadraoBR("+1 415 555 2671 0")).toBe("141555526710");
  });
  it("exibição sempre com o 9 do celular", () => {
    expect(telefoneLegivel("555596356217")).toBe("(55) 99635-6217");
    expect(telefoneLegivel("5554969602960")).toBe("(54) 96960-2960");
    expect(telefoneLegivel("555535121234")).toBe("(55) 3512-1234");
  });
});
