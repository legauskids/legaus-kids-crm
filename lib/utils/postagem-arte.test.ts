import { describe, expect, it } from "vitest";
import { comMaiuscula, elementosDaCapa, montarArtes, tamanhoQueCabe, textosPadrao, type ElementoSelo, type FotoDoPost } from "./postagem-arte";

const SELOS = ["Diversão Garantida", "Qualidade e Segurança"];
const deitada = (id: string): FotoDoPost => ({ id, largura: 1600, altura: 900 });
const empe = (id: string): FotoDoPost => ({ id, largura: 900, altura: 1600 });

describe("elementosDaCapa — medidas das artes aprovadas (16/10/2026)", () => {
  it("feed: título em 66,62 e selos 22 px abaixo dele, logo de 340 a 64 px do fundo", () => {
    const e = elementosDaCapa("FEED", ["Entrega de", "Playground"], SELOS);
    expect(e[0]).toMatchObject({ tipo: "titulo", x: 66, y: 62, linhas: [{ t: "Entrega de", tam: 58, cor: "teal" }, { t: "Playground", tam: 100, cor: "laranja" }] });
    const [s1, s2] = e.filter((x): x is ElementoSelo => x.tipo === "selo");
    // Na arte aprovada o selo laranja começa em y≈293 e o branco 12 px depois do primeiro (54 de altura).
    expect(Math.abs(s1.y - 293)).toBeLessThanOrEqual(2);
    expect(s2.y).toBe(s1.y + 54 + 12);
    expect(s1.estilo).toBe("laranja");
    expect(s2.estilo).toBe("branco");
    expect(e.at(-1)).toEqual({ id: "logo", tipo: "logo", cx: 540, base: 1286, larg: 340 });
  });
  it("story: título em y=250 (fora dos 250 px de cima) e logo a 270 px do fundo", () => {
    const e = elementosDaCapa("STORY", ["Entrega de", "Playground"], SELOS);
    expect(e[0]).toMatchObject({ y: 250, linhas: [{ tam: 66 }, { tam: 114 }] });
    const s1 = e.find((x): x is ElementoSelo => x.tipo === "selo");
    expect(Math.abs((s1?.y ?? 0) - 514)).toBeLessThanOrEqual(2);
    expect(e.at(-1)).toMatchObject({ base: 1920 - 270, larg: 400 });
  });
  it("no máximo 2 selos (3 informações por imagem) e tudo com maiúscula", () => {
    const e = elementosDaCapa("FEED", ["entrega de", "gangorra"], ["um", "dois", "três"]);
    expect(e.filter((x) => x.tipo === "selo")).toHaveLength(2);
    expect(e[0]).toMatchObject({ linhas: [{ t: "Entrega de" }, { t: "Gangorra" }] });
  });
  it("palavra comprida diminui pra caber", () => {
    expect(tamanhoQueCabe("Playground", 100)).toBe(100);
    expect(tamanhoQueCabe("Playground Completo Duas Torres", 100)).toBeLessThan(100);
  });
});

describe("montarArtes — formatos por tipo de post", () => {
  it("entrega: capa com a foto em pé, slides com 2 deitadas e o story", () => {
    const artes = montarArtes({ conteudo: "ENTREGA", fotos: [deitada("a"), empe("b"), deitada("c"), deitada("d"), deitada("e")], titulo: ["Entrega de", "Playground"], selos: SELOS });
    expect(artes.map((a) => a.formato)).toEqual(["FEED", "FEED", "FEED", "STORY"]);
    expect(artes[0].dados.fotos[0].imagemId).toBe("b");
    expect(artes[1].dados.fotos.map((f) => f.imagemId)).toEqual(["a", "c"]);
    expect(artes[2].dados.fotos.map((f) => f.imagemId)).toEqual(["d", "e"]);
    expect(artes[1].dados.fotos[0].box).toEqual([32, 32, 1048, 667]);
    expect(artes[1].dados.fotos[1].box).toEqual([32, 683, 1048, 1318]);
    expect(artes[1].dados.elementos).toEqual([{ id: "logo", tipo: "logo", cx: 540, base: 1294, larg: 250 }]);
    expect(artes[3].dados).toMatchObject({ w: 1080, h: 1920 });
  });
  it("carrossel para em 10 itens", () => {
    const fotos = [empe("capa"), ...Array.from({ length: 25 }, (_, i) => deitada(`f${i}`))];
    const artes = montarArtes({ conteudo: "ENTREGA", fotos, titulo: ["Entrega de", "Playground"], selos: SELOS });
    expect(artes.filter((a) => a.formato === "FEED")).toHaveLength(10);
  });
  it("instalação e TBT: só story; produto: feed e story", () => {
    const base = { fotos: [deitada("a")], titulo: ["X", "Y"] as [string, string], selos: [] };
    expect(montarArtes({ ...base, conteudo: "INSTALACAO" }).map((a) => a.formato)).toEqual(["STORY"]);
    expect(montarArtes({ ...base, conteudo: "TBT" }).map((a) => a.formato)).toEqual(["STORY"]);
    expect(montarArtes({ ...base, conteudo: "PRODUTO" }).map((a) => a.formato)).toEqual(["FEED", "STORY"]);
  });
  it("benefícios: capa e um slide por argumento", () => {
    const artes = montarArtes({ conteudo: "BENEFICIOS", fotos: [empe("a"), deitada("b")], titulo: ["Por que escolher a", "Legaus Kids"], selos: [], argumentos: ["Fabricação própria", "", "Garantia"] });
    expect(artes).toHaveLength(3);
    expect(artes[1].dados.elementos[0]).toMatchObject({ tipo: "titulo", linhas: [{ t: "Fabricação própria" }] });
  });
  it("sem foto não monta nada", () => {
    expect(montarArtes({ conteudo: "ENTREGA", fotos: [], titulo: ["a", "b"], selos: [] })).toEqual([]);
  });
});

describe("textos padrão", () => {
  it("entrega leva os selos padrão; produto leva o preço no selo laranja", () => {
    expect(textosPadrao("ENTREGA", "gangorra")).toEqual({ titulo: ["Entrega de", "Gangorra"], selos: SELOS });
    expect(textosPadrao("PRODUTO", "Casinha", "R$ 2.500,00").selos[0]).toBe("Por R$ 2.500,00");
    expect(comMaiuscula("  instalação em andamento")).toBe("Instalação em andamento");
  });
});
