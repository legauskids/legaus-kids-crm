import { describe, expect, it } from "vitest";
import { AREA_UTIL, FOLHA, anexosParaSalvarSchema, paginarAnexos, urlAnexo } from "./anexos-orcamento";

const anexo = (id: string, tamanho: number, largura = 1600, altura = 1200, legenda: string | null = null) => ({ id, tamanho, largura, altura, legenda });
const W = AREA_UTIL.largura;
const H = AREA_UTIL.altura;
const G = FOLHA.espaco;

describe("paginarAnexos", () => {
  it("sem imagens não tem folha", () => {
    expect(paginarAnexos([])).toEqual([]);
  });

  it("imagem inteira ocupa a largura útil e mantém a proporção", () => {
    const [[c]] = paginarAnexos([anexo("a", 100)]);
    expect(c.x).toBeCloseTo(0);
    expect(c.y).toBeCloseTo(0);
    expect(c.largura).toBeCloseTo(W);
    expect(c.altura).toBeCloseTo(W * 0.75);
  });

  it("duas de 50% e três de 33% cabem lado a lado", () => {
    const [metades] = paginarAnexos([anexo("a", 50), anexo("b", 50)]);
    expect(metades.map((c) => c.y)).toEqual([0, 0]);
    expect(metades[1].x + metades[1].largura).toBeCloseTo(W);

    const [tercos] = paginarAnexos([anexo("a", 33), anexo("b", 33), anexo("c", 33)]);
    expect(new Set(tercos.map((c) => c.y)).size).toBe(1);
    expect(tercos[2].x + tercos[2].largura).toBeLessThanOrEqual(W);
  });

  it("o que não cabe na linha desce, e linha sozinha fica centralizada", () => {
    const [folha] = paginarAnexos([anexo("a", 50), anexo("b", 50), anexo("c", 50)]);
    const c = folha[2];
    expect(c.y).toBeCloseTo(folha[0].altura + G);
    expect(c.x).toBeCloseTo((W - c.largura) / 2);
  });

  it("passa pra outra folha quando a linha não cabe", () => {
    // Paisagem 4:3 inteira: ~398 pt de altura — só uma por folha (área útil ~730).
    const folhas = paginarAnexos([anexo("a", 100), anexo("b", 100), anexo("c", 100)]);
    expect(folhas.map((f) => f.map((c) => c.id))).toEqual([["a"], ["b"], ["c"]]);
    expect(folhas[1][0].y).toBe(0);
  });

  it("imagem muito alta encolhe pra caber na folha, contando a legenda", () => {
    const [[c]] = paginarAnexos([anexo("a", 100, 900, 3000, "Planta baixa")]);
    expect(c.altura + FOLHA.legenda).toBeCloseTo(H);
    expect(c.largura).toBeCloseTo((H - FOLHA.legenda) * 0.3);
    expect(c.legenda).toBe("Planta baixa");
  });

  it("imagens de alturas diferentes ficam centralizadas na linha", () => {
    const [folha] = paginarAnexos([anexo("baixa", 50, 1600, 800), anexo("alta", 50, 1200, 1600)]);
    const [baixa, alta] = folha;
    expect(alta.y).toBe(0);
    expect(baixa.y).toBeCloseTo((alta.altura - baixa.altura) / 2);
  });

  it("tamanho fora da faixa é limitado", () => {
    const [[pequena]] = paginarAnexos([anexo("a", 1)]);
    expect(pequena.largura).toBeCloseTo(0.2 * (W + G) - G);
    const [[grande]] = paginarAnexos([anexo("a", 400)]);
    expect(grande.largura).toBeCloseTo(W);
  });
});

describe("anexosParaSalvarSchema", () => {
  it("limpa legenda e tamanho", () => {
    expect(
      anexosParaSalvarSchema.parse([
        { id: "a", legenda: "  Vista   frontal ", tamanho: 50.4 },
        { id: "b", legenda: "   ", tamanho: 5 },
        { id: "c", legenda: "x".repeat(200), tamanho: "abc" },
      ]),
    ).toEqual([
      { id: "a", legenda: "Vista frontal", tamanho: 50 },
      { id: "b", legenda: null, tamanho: 20 },
      { id: "c", legenda: "x".repeat(80), tamanho: 100 },
    ]);
  });
});

describe("urlAnexo", () => {
  it("leva o token do link público quando tem", () => {
    expect(urlAnexo("abc")).toBe("/api/imagem/orcamento-anexo/abc");
    expect(urlAnexo("abc", "tok")).toBe("/api/imagem/orcamento-anexo/abc?t=tok");
  });
});
