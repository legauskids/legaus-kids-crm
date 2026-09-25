import { describe, expect, it } from "vitest";
import { mesmoTelefone, pareceTelefone, partesTelefone } from "./telefone";

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
