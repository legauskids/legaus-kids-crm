import { describe, expect, it } from "vitest";
import { erroMetaLegivel, escolherPagina, faltandoPermissoes, nadaPendente, partesPendentes, type PaginaMeta } from "./meta-publicacao";

const legaus: PaginaMeta = { id: "1", nome: "Legaus Kids", instagramId: "ig1", instagramUsuario: "legauskids" };
const outra: PaginaMeta = { id: "2", nome: "Outra", instagramId: null, instagramUsuario: null };

describe("escolherPagina", () => {
  it("a única com Instagram ligado é a escolhida", () => {
    expect(escolherPagina([outra, legaus])).toEqual({ pagina: legaus });
  });
  it("com mais de uma com Instagram, quem conecta escolhe", () => {
    const r = escolherPagina([legaus, { ...outra, instagramId: "ig2", instagramUsuario: "x" }]);
    expect("escolher" in r && r.escolher).toHaveLength(2);
  });
  it("a pedida vale; nenhuma página é erro", () => {
    expect(escolherPagina([legaus, outra], "2")).toEqual({ pagina: outra });
    expect(escolherPagina([])).toMatchObject({ erro: expect.any(String) });
  });
});

describe("permissões", () => {
  it("lista o que falta, com e sem a do Facebook", () => {
    expect(faltandoPermissoes(["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement"], false)).toEqual([]);
    expect(faltandoPermissoes(["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement"], true)).toEqual(["pages_manage_posts"]);
  });
});

describe("partesPendentes — tentar de novo só refaz o que falhou", () => {
  const partes = { feed: 4, story: 1 };
  it("nada feito: tudo pendente", () => {
    expect(partesPendentes(partes, { instagram: true, facebook: true }, null)).toEqual({ instagramFeed: true, instagramStory: true, facebook: true });
  });
  it("feed do Instagram já saiu: falta story e Facebook", () => {
    const p = partesPendentes(partes, { instagram: true, facebook: true }, { instagram: { feedId: "m1" } });
    expect(p).toEqual({ instagramFeed: false, instagramStory: true, facebook: true });
    expect(nadaPendente(p)).toBe(false);
  });
  it("Facebook desligado e tudo do Instagram feito: nada pendente", () => {
    expect(nadaPendente(partesPendentes(partes, { instagram: true, facebook: false }, { instagram: { feedId: "m1", storyIds: ["s1"] } }))).toBe(true);
  });
  it("post só de story não vai pro feed nem pro Facebook", () => {
    expect(partesPendentes({ feed: 0, story: 1 }, { instagram: true, facebook: true }, null)).toEqual({ instagramFeed: false, instagramStory: true, facebook: false });
  });
  it("story postado pelo celular não sai de novo; o feed continua pendente", () => {
    const feito = { instagram: { storyPeloCelularEm: "2026-10-29T15:00:00.000Z" } };
    expect(partesPendentes(partes, { instagram: true, facebook: true }, feito)).toEqual({ instagramFeed: true, instagramStory: false, facebook: true });
    expect(nadaPendente(partesPendentes({ feed: 0, story: 2 }, { instagram: true, facebook: false }, feito))).toBe(true);
  });
});

describe("erroMetaLegivel", () => {
  it("acesso expirado pede pra reconectar", () => {
    expect(erroMetaLegivel({ code: 190, message: "Error validating access token" }, "x")).toMatch(/reconecte/);
  });
  it("sem erro conhecido, usa a mensagem da Meta", () => {
    expect(erroMetaLegivel({ code: 9004, message: "Only photo or video can be accepted as media type." }, "x")).toBe("Only photo or video can be accepted as media type.");
  });
});
