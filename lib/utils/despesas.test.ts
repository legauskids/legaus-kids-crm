import { describe, expect, it } from "vitest";
import {
  centroDoSeletor,
  dataDaDespesa,
  filtroDaUrl,
  pendenciasDaDespesa,
  seletorDoCentro,
  statusDoFiltro,
  textoParaCentavos,
  validarCentro,
} from "./despesas";
import { diaBrasilia } from "./brasilia";

describe("textoParaCentavos", () => {
  it("entende os jeitos comuns de escrever valor", () => {
    expect(textoParaCentavos("96")).toBe(9600);
    expect(textoParaCentavos("96,50")).toBe(9650);
    expect(textoParaCentavos("R$ 1.234,56")).toBe(123456);
    expect(textoParaCentavos("1234.56")).toBe(123456);
    expect(textoParaCentavos("1.500")).toBe(150000);
    expect(textoParaCentavos("12.50")).toBe(1250);
  });

  it("devolve NaN pra texto inválido", () => {
    expect(textoParaCentavos("")).toBeNaN();
    expect(textoParaCentavos("abc")).toBeNaN();
  });
});

describe("dataDaDespesa", () => {
  it("guarda meio-dia de Brasília, então o dia não muda nem em UTC nem em Brasília", () => {
    const d = dataDaDespesa("2026-10-07");
    expect(d.toISOString()).toBe("2026-10-07T15:00:00.000Z");
    expect(diaBrasilia(d)).toBe("2026-10-07");
  });

  it("recusa data inválida", () => {
    expect(() => dataDaDespesa("07/10/2026")).toThrow();
    expect(() => dataDaDespesa("2026-02-31")).toThrow();
  });
});

describe("pendenciasDaDespesa", () => {
  const completa = { valorCentavos: 9600, fornecedor: "Sabor Gaúcho", categoriaId: "cat", centroGeralId: "cg", negocioId: null };

  it("completa não tem pendência", () => {
    expect(pendenciasDaDespesa(completa)).toEqual([]);
    expect(pendenciasDaDespesa({ ...completa, centroGeralId: null, negocioId: "neg" })).toEqual([]);
  });

  it("lista o que falta", () => {
    expect(pendenciasDaDespesa({ valorCentavos: 0, fornecedor: " ", categoriaId: null, centroGeralId: null, negocioId: null })).toEqual([
      "valor",
      "fornecedor",
      "categoria",
      "centro de custo",
    ]);
  });
});

describe("centro da despesa", () => {
  it("não aceita centro geral e projeto ao mesmo tempo", () => {
    expect(() => validarCentro({ centroGeralId: "cg", negocioId: "neg" })).toThrow();
    expect(() => validarCentro({ centroGeralId: "cg", negocioId: null })).not.toThrow();
  });

  it("converte o valor do seletor nos dois sentidos", () => {
    expect(centroDoSeletor("g:cg-veiculos")).toEqual({ centroGeralId: "cg-veiculos", negocioId: null });
    expect(centroDoSeletor("n:neg1")).toEqual({ centroGeralId: null, negocioId: "neg1" });
    expect(centroDoSeletor("")).toEqual({ centroGeralId: null, negocioId: null });
    expect(seletorDoCentro({ centroGeralId: "cg-veiculos", negocioId: null })).toBe("g:cg-veiculos");
    expect(seletorDoCentro({ centroGeralId: null, negocioId: "neg1" })).toBe("n:neg1");
  });
});

describe("filtros", () => {
  it("todas inclui rascunhos; os outros filtram por status", () => {
    expect(statusDoFiltro("TODAS")).toBeNull();
    expect(statusDoFiltro("AGUARDANDO")).toEqual(["AGUARDANDO_CONCILIACAO"]);
    expect(statusDoFiltro("CONCILIADAS")).toEqual(["CONCILIADA"]);
    expect(filtroDaUrl("qualquer")).toBe("TODAS");
    expect(filtroDaUrl("CONCILIADAS")).toBe("CONCILIADAS");
  });
});
