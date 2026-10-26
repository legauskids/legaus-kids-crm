import { describe, expect, it } from "vitest";
import {
  alvoValido,
  areaSeguraDaFoto,
  comMaiuscula,
  elementosDaCapa,
  enquadrarNoAlvo,
  zoomMinimo,
  montarArtes,
  recorteDaFoto,
  sanitizarDadosArte,
  selosComLocal,
  slidesDasFotos,
  iconeSeloSvg,
  tamanhoQueCabe,
  textosPadrao,
  type ElementoLogo,
  type ElementoSelo,
  type ElementoTitulo,
  type FotoDoPost,
} from "./postagem-arte";

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

describe("sanitizarDadosArte — o que o editor pode mudar (etapa 2)", () => {
  const guardada = montarArtes({ conteudo: "ENTREGA", fotos: [empe("a"), deitada("b"), deitada("c")], titulo: ["Entrega de", "Playground"], selos: SELOS })[0].dados;
  it("aceita posição, tamanho e enquadramento; mantém as caixas das fotos", () => {
    const enviada = structuredClone(guardada);
    enviada.fotos[0] = { ...enviada.fotos[0], box: [0, 0, 10, 10], fx: 0.2, fy: 0.9, zoom: 2 };
    const t = enviada.elementos.find((e) => e.tipo === "titulo")!;
    Object.assign(t, { x: 120, y: 400, escala: 1.3 });
    const r = sanitizarDadosArte(guardada, enviada, ["a", "b", "c"]);
    expect(r.fotos[0]).toEqual({ imagemId: "a", box: guardada.fotos[0].box, fx: 0.2, fy: 0.9, zoom: 2 });
    expect(r.elementos.find((e) => e.tipo === "titulo")).toMatchObject({ x: 120, y: 400, escala: 1.3 });
  });
  it("só troca por foto do próprio post e limita zoom e ponto focal", () => {
    const enviada = structuredClone(guardada);
    enviada.fotos[0] = { ...enviada.fotos[0], imagemId: "de-outro-post", fx: 7, zoom: 99 };
    const r = sanitizarDadosArte(guardada, enviada, ["a", "b", "c"]);
    expect(r.fotos[0]).toMatchObject({ imagemId: "a", fx: 1, zoom: 4 });
    const troca = sanitizarDadosArte(guardada, { ...enviada, fotos: [{ ...enviada.fotos[0], imagemId: "c" }] }, ["a", "b", "c"]);
    expect(troca.fotos[0].imagemId).toBe("c");
  });
  it("no máximo 2 selos, texto com maiúscula e cor só da marca", () => {
    const enviada = structuredClone(guardada);
    enviada.elementos.push({ id: "x", tipo: "selo", x: 66, y: 500, t: "terceiro selo", tam: 27, estilo: "laranja" });
    const t = enviada.elementos.find((e): e is ElementoTitulo => e.tipo === "titulo")!;
    t.linhas[0] = { ...t.linhas[0], t: "entrega da", cor: "roxo" as never };
    const r = sanitizarDadosArte(guardada, enviada, ["a"]);
    expect(r.elementos.filter((e) => e.tipo === "selo")).toHaveLength(2);
    expect(r.elementos.find((e): e is ElementoTitulo => e.tipo === "titulo")?.linhas[0]).toMatchObject({ t: "Entrega da", cor: "teal" });
  });
  it("logo nunca some, só muda tamanho e posição, e fica dentro da arte", () => {
    const semLogo = { ...structuredClone(guardada), elementos: guardada.elementos.filter((e) => e.tipo !== "logo") };
    expect(sanitizarDadosArte(guardada, semLogo, ["a"]).elementos.find((e) => e.tipo === "logo")).toEqual({ id: "logo", tipo: "logo", cx: 540, base: 1286, larg: 340 });
    const fora = structuredClone(guardada);
    Object.assign(fora.elementos.find((e) => e.tipo === "logo")!, { cx: 5000, base: -10, larg: 2000 });
    const logo = sanitizarDadosArte(guardada, fora, ["a"]).elementos.find((e): e is ElementoLogo => e.tipo === "logo")!;
    expect(logo.larg).toBe(640);
    expect(logo.cx).toBe(1080 - 320);
    expect(logo.base).toBeGreaterThan(0);
  });
});

describe("recorteDaFoto", () => {
  it("cobre a caixa sem distorcer e respeita o ponto focal", () => {
    const r = recorteDaFoto({ largura: 2000, altura: 1000 }, { box: [0, 0, 1000, 1000], fx: 0, fy: 0.5, zoom: 1 });
    expect(r).toMatchObject({ w: 1000, h: 1000, rw: 2000, rh: 1000, left: 0, top: 0 });
    expect(recorteDaFoto({ largura: 2000, altura: 1000 }, { box: [0, 0, 1000, 1000], fx: 1, fy: 0.5, zoom: 1 }).left).toBe(1000);
    expect(recorteDaFoto({ largura: 2000, altura: 1000 }, { box: [0, 0, 1000, 1000], fx: 0.5, fy: 0.5, zoom: 2 })).toMatchObject({ rw: 4000, rh: 2000, left: 1500, top: 500 });
  });

  it("zoom < 1: a foto diminui até caber inteira e o resto é fundo (posição pelo ponto focal)", () => {
    // 2000×1000 numa caixa quadrada de 1000: cobrir = 1, caber = 0,5.
    expect(zoomMinimo({ largura: 2000, altura: 1000 }, [0, 0, 1000, 1000])).toBe(0.5);
    const inteira = recorteDaFoto({ largura: 2000, altura: 1000 }, { box: [0, 0, 1000, 1000], fx: 0.5, fy: 0.5, zoom: 0.5 });
    expect(inteira).toMatchObject({ rw: 1000, rh: 500, left: 0, top: 0, dx: 0, dy: 250, preenche: false });
    // Não passa da foto inteira, e o ponto focal posiciona a faixa (0 = em cima, 1 = embaixo).
    expect(recorteDaFoto({ largura: 2000, altura: 1000 }, { box: [0, 0, 1000, 1000], fx: 0.5, fy: 1, zoom: 0.1 })).toMatchObject({ rw: 1000, rh: 500, dy: 500 });
    // No meio do caminho: corta dos lados e sobra fundo em cima/embaixo.
    expect(recorteDaFoto({ largura: 2000, altura: 1000 }, { box: [0, 0, 1000, 1000], fx: 0.5, fy: 0.5, zoom: 0.75 })).toMatchObject({ rw: 1500, rh: 750, left: 250, dx: 0, dy: 125, preenche: false });
    expect(recorteDaFoto({ largura: 2000, altura: 1000 }, { box: [0, 0, 1000, 1000], fx: 0.5, fy: 0.5, zoom: 1 }).preenche).toBe(true);
  });
});

describe("enquadrarNoAlvo (brinquedos sempre inteiros — 26/10)", () => {
  // Foto do post #40: 1280×590, num slide de 1 foto (caixa 1016×1286).
  const larga = { largura: 1280, altura: 590 };
  const caixa: [number, number, number, number] = [32, 32, 1048, 1318];

  it("brinquedos pequenos no meio: continua cobrindo a caixa, centrado neles", () => {
    const e = enquadrarNoAlvo(larga, caixa, [0.4, 0.3, 0.6, 0.9]);
    expect(e.zoom).toBe(1);
    const r = recorteDaFoto(larga, { box: caixa, ...e });
    // Os brinquedos (40% a 60% da largura) ficam dentro do que aparece.
    expect(0.37 * r.rw).toBeGreaterThanOrEqual(r.left);
    expect(0.63 * r.rw).toBeLessThanOrEqual(r.left + r.w);
  });

  it("brinquedos de ponta a ponta na foto larga: diminui até caber inteira", () => {
    const e = enquadrarNoAlvo(larga, caixa, [0, 0.14, 1, 1]);
    expect(e.zoom).toBeCloseTo(zoomMinimo(larga, caixa), 3);
    expect(recorteDaFoto(larga, { box: caixa, ...e }).preenche).toBe(false);
  });

  it("brinquedos num canto: o ponto focal vai até eles, sem sair da foto", () => {
    const e = enquadrarNoAlvo(larga, caixa, [0.75, 0.2, 0.95, 0.9]);
    const r = recorteDaFoto(larga, { box: caixa, ...e });
    expect(r.left + r.w).toBeGreaterThanOrEqual(Math.round(0.95 * r.rw));
    expect(r.left + r.w).toBeLessThanOrEqual(r.rw);
  });

  it("fica fora da faixa da logo e, na capa, abaixo do título e dos selos", () => {
    const slide = { elementos: [{ id: "logo", tipo: "logo" as const, cx: 540, base: 1294, larg: 250 }] };
    const seguro = areaSeguraDaFoto(slide, caixa);
    expect(seguro[3]).toBeLessThan(1294 - 250 * 0.6);
    const capa = { elementos: elementosDaCapa("FEED", ["Entrega de", "Brinquedos"], ["Diversão Garantida", "Qualidade e Segurança"]) };
    const seguroCapa = areaSeguraDaFoto(capa, caixa);
    expect(seguroCapa[1]).toBeGreaterThan(300);
    // Com os brinquedos ocupando a foto toda, eles terminam dentro da área segura.
    const e = enquadrarNoAlvo(larga, caixa, [0.1, 0.1, 0.9, 0.95], seguroCapa);
    const r = recorteDaFoto(larga, { box: caixa, ...e });
    const topoBrinquedos = caixa[1] + r.dy + (0.07 * r.rh - r.top);
    expect(topoBrinquedos).toBeGreaterThanOrEqual(seguroCapa[1] - 1);
  });

  it("caixa de brinquedos vinda de fora só vale se for válida", () => {
    expect(alvoValido([0.1, 0.2, 0.8, 0.9])).toEqual([0.1, 0.2, 0.8, 0.9]);
    expect(alvoValido([0.8, 0.2, 0.1, 0.9])).toBeNull();
    expect(alvoValido([0, 0, 1.5, 1])).toBeNull();
    expect(alvoValido("x")).toBeNull();
  });
});

describe("selo de localização (pedido de 21/10 — \"Bob's Vacaria\")", () => {
  it("o local entra no lugar do segundo selo, com ícone de pino", () => {
    expect(selosComLocal(["Diversão Garantida", "Qualidade e Segurança"], "Bob's Vacaria")).toEqual(["Diversão Garantida", { t: "Bob's Vacaria", icone: "local" }]);
    expect(selosComLocal([], "Bob's Vacaria")).toEqual([{ t: "Bob's Vacaria", icone: "local" }]);
    expect(selosComLocal(["A", "B"], "  ")).toEqual(["A", "B"]);
  });
  it("a capa leva o selo de local com o ícone, e a validação do editor mantém o ícone", () => {
    const e = elementosDaCapa("FEED", ["Entrega de", "Kidplay"], selosComLocal(["Diversão Garantida", "Qualidade e Segurança"], "Bob's Vacaria"));
    const local = e.filter((x): x is ElementoSelo => x.tipo === "selo")[1];
    expect(local).toMatchObject({ t: "Bob's Vacaria", estilo: "branco", icone: "local" });
    const dados = { w: 1080, h: 1350, fotos: [], elementos: e };
    expect(sanitizarDadosArte(dados, dados, []).elementos.find((x) => x.id === "selo2")).toMatchObject({ icone: "local" });
  });
  it("o ícone de pino é um SVG diferente do check", () => {
    expect(iconeSeloSvg("local", 15, "#fff", "#000")).toContain("<path");
    expect(iconeSeloSvg(undefined, 15, "#fff", "#000")).toContain("<polyline");
  });
});

describe("fotos por slide (21/10: \"um slide pra cada foto\")", () => {
  const fotos5 = [empe("capa"), deitada("a"), deitada("b"), empe("c"), deitada("d")];
  it("1 por slide: cada foto num slide inteiro, na ordem em que vieram, sem a da capa", () => {
    const { slides, foraDoCarrossel } = slidesDasFotos(fotos5, "capa", 1);
    expect(slides.map((s) => s.fotos.map((f) => f.imagemId))).toEqual([["a"], ["b"], ["c"], ["d"]]);
    expect(slides[0].fotos[0].box).toEqual([32, 32, 1048, 1318]);
    expect(foraDoCarrossel).toBe(0);
  });
  it("2 por slide continua igual (deitadas primeiro)", () => {
    expect(slidesDasFotos(fotos5, "capa", 2).slides.map((s) => s.fotos.map((f) => f.imagemId))).toEqual([["a", "b"], ["d", "c"]]);
  });
  it("carrossel até 10: com 1 por slide, o que passar de 9 slides fica de fora", () => {
    const muitas = [empe("capa"), ...Array.from({ length: 12 }, (_, i) => deitada(`f${i}`))];
    const r = slidesDasFotos(muitas, "capa", 1);
    expect(r.slides).toHaveLength(9);
    expect(r.foraDoCarrossel).toBe(3);
  });
  it("montarArtes da entrega respeita fotosPorSlide", () => {
    const artes = montarArtes({ conteudo: "ENTREGA", fotos: fotos5, titulo: ["Entrega de", "Kidplay"], selos: [], fotosPorSlide: 1 });
    expect(artes.map((a) => a.formato)).toEqual(["FEED", "FEED", "FEED", "FEED", "FEED", "STORY"]);
  });
});
