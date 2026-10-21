import { describe, expect, it } from "vitest";
import { afirmaQueFez, aplicarAjuste, respostaHonesta, resumoDasArtes } from "./marketing-agente";
import { montarArtes, type DadosArte, type ElementoLogo, type ElementoSelo, type ElementoTitulo, type FotoDoPost } from "./postagem-arte";

const fotos: FotoDoPost[] = [
  { id: "a", largura: 900, altura: 1600 },
  { id: "b", largura: 1600, altura: 900 },
  { id: "c", largura: 1600, altura: 900 },
];
const artes = montarArtes({ conteudo: "ENTREGA", fotos, titulo: ["Entrega de", "Playground"], selos: ["Diversão Garantida", "Qualidade e Segurança"] });
const capa = artes[0].dados;
const slide = artes[1].dados;

function ok(r: ReturnType<typeof aplicarAjuste>): DadosArte {
  if (!r.ok) throw new Error(r.erro);
  return r.dados;
}
const titulo = (d: DadosArte) => d.elementos.find((e): e is ElementoTitulo => e.tipo === "titulo");
const selos = (d: DadosArte) => d.elementos.filter((e): e is ElementoSelo => e.tipo === "selo");
const logo = (d: DadosArte) => d.elementos.find((e): e is ElementoLogo => e.tipo === "logo")!;

describe("aplicarAjuste — o que o assistente pode fazer numa arte", () => {
  it("move o título (relativo ou absoluto), muda o tamanho e o texto com maiúscula", () => {
    const d = ok(aplicarAjuste(capa, "FEED", { elemento: "titulo", dy: 100, escala: 1.2, linha2: "gangorra" }, fotos));
    expect(titulo(d)).toMatchObject({ x: 66, y: 162, escala: 1.2, linhas: [{ t: "Entrega de" }, { t: "Gangorra" }] });
    expect(titulo(ok(aplicarAjuste(capa, "FEED", { elemento: "titulo", x: 100, y: 500 }, fotos)))).toMatchObject({ x: 100, y: 500 });
  });
  it("ajusta, cria e tira selos (no máximo 2)", () => {
    const d = ok(aplicarAjuste(capa, "FEED", { elemento: "selo2", texto: "garantia de 5 anos" }, fotos));
    expect(selos(d)[1].t).toBe("Garantia de 5 anos");
    const sem = ok(aplicarAjuste(capa, "FEED", { elemento: "selo2", remover: true }, fotos));
    expect(selos(sem)).toHaveLength(1);
    const devolta = ok(aplicarAjuste(sem, "FEED", { elemento: "selo2", texto: "Feito no RS" }, fotos));
    expect(selos(devolta)).toHaveLength(2);
    expect(selos(devolta)[1]).toMatchObject({ t: "Feito no RS", estilo: "branco" });
    expect(devolta.elementos.at(-1)?.tipo).toBe("logo");
  });
  it("logo muda de tamanho e posição, centraliza, mas nunca sai", () => {
    const d = ok(aplicarAjuste(capa, "FEED", { elemento: "logo", larg: 420, dx: -100 }, fotos));
    expect(logo(d)).toMatchObject({ larg: 420, cx: 440 });
    expect(logo(ok(aplicarAjuste(d, "FEED", { elemento: "logo", centralizar: true }, fotos))).cx).toBe(540);
    expect(aplicarAjuste(capa, "FEED", { elemento: "logo", remover: true }, fotos)).toMatchObject({ ok: false });
  });
  it("troca a foto pelo número da foto do post (enquadramento volta ao centro) e enquadra", () => {
    const d = ok(aplicarAjuste(capa, "FEED", { elemento: "foto1", foto: 3 }, fotos));
    expect(d.fotos[0]).toMatchObject({ imagemId: "c", fx: 0.5, fy: 0.5, zoom: 1 });
    expect(ok(aplicarAjuste(slide, "FEED", { elemento: "foto2", fy: 0.2, zoom: 1.5 }, fotos)).fotos[1]).toMatchObject({ fy: 0.2, zoom: 1.5 });
    expect(aplicarAjuste(capa, "FEED", { elemento: "foto2", fy: 0.2 }, fotos)).toMatchObject({ ok: false });
    expect(aplicarAjuste(capa, "FEED", { elemento: "foto1", foto: 9 }, fotos)).toMatchObject({ ok: false });
  });
  it("põe título num slide que não tinha", () => {
    const d = ok(aplicarAjuste(slide, "FEED", { elemento: "titulo", linha2: "balanço duplo" }, fotos));
    expect(titulo(d)?.linhas.map((l) => l.t)).toEqual(["Balanço duplo"]);
  });
});

describe("resumoDasArtes", () => {
  it("numera as artes como na tela e diz qual foto do post está em cada caixa", () => {
    const r = resumoDasArtes(artes.map((a, ordem) => ({ ordem, ...a })), fotos);
    expect(r[0]).toMatchObject({ arte: 1, tipo: "capa do carrossel (1080×1350)", fotos: [{ elemento: "foto1", fotoDoPost: 1 }] });
    expect(r[1]).toMatchObject({ arte: 2, tipo: "slide 2 do carrossel (1080×1350)", titulo: null });
    expect(r.at(-1)?.tipo).toBe("story (1080×1920)");
  });
});

describe("título e selos andam juntos (teste de 20/10)", () => {
  it("descer o título leva os selos junto", () => {
    const d = ok(aplicarAjuste(capa, "FEED", { elemento: "titulo", dy: 100 }, fotos));
    expect(titulo(d)?.y).toBe(162);
    expect(selos(d).map((s) => s.y)).toEqual(selos(capa).map((s) => s.y + 100));
  });
  it("aumentar o título empurra os selos pra não cobrir", () => {
    const d = ok(aplicarAjuste(capa, "FEED", { elemento: "titulo", escala: 1.3 }, fotos));
    expect(selos(d)[0].y).toBeGreaterThan(selos(capa)[0].y + 50);
  });
  it("soTitulo: o título anda sozinho", () => {
    const d = ok(aplicarAjuste(capa, "FEED", { elemento: "titulo", dy: 100, soTitulo: true }, fotos));
    expect(selos(d).map((s) => s.y)).toEqual(selos(capa).map((s) => s.y));
  });
});

describe("selo de localização pelo assistente (21/10)", () => {
  it("cria o selo com pino e troca o ícone de um selo existente", () => {
    const sem = ok(aplicarAjuste(capa, "FEED", { elemento: "selo2", remover: true }, fotos));
    const d = ok(aplicarAjuste(sem, "FEED", { elemento: "selo2", texto: "Bob's Vacaria", icone: "local" }, fotos));
    expect(selos(d)[1]).toMatchObject({ t: "Bob's Vacaria", icone: "local" });
    const r = aplicarAjuste(capa, "FEED", { elemento: "selo1", icone: "local", texto: "Praça Central" }, fotos);
    expect(r.ok && r.feito).toContain("ícone check→local");
  });
});

describe("respostaHonesta (21/10: \"Feito.\" sem ter feito nada)", () => {
  it("com mudança, mostra o que mudou de verdade", () => {
    const r = respostaHonesta("Pronto, deixei uma foto por slide.", ["Slides refeitos: 3 com 1 foto cada"]);
    expect(r).toContain("✔️ O que mudou:");
    expect(r).toContain("• Slides refeitos: 3 com 1 foto cada");
  });
  it("sem mudança, \"Feito.\" ou texto vazio viram \"não consegui\"", () => {
    expect(respostaHonesta("Feito.", [])).toMatch(/^⚠️ Não consegui/);
    expect(respostaHonesta("", [])).toMatch(/^⚠️ Não consegui/);
    expect(respostaHonesta("Troquei a capa pela foto 2.", [])).toMatch(/^⚠️ Não consegui/);
  });
  it("opinião ou pergunta sem mudança passa como veio", () => {
    expect(respostaHonesta("O título não cobre o brinquedo — está no céu.", [])).toBe("O título não cobre o brinquedo — está no céu.");
    expect(afirmaQueFez("Quer que eu aumente a logo?")).toBe(false);
  });
});
