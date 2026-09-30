import { describe, expect, it } from "vitest";
import { categoriaDoFormulario, normalizarLink, SEM_CATEGORIA } from "./categoria-tarefa";

function form(campos: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  return f;
}

describe("categoriaDoFormulario", () => {
  it("lê categoria e link; 'sem categoria' e vazio viram null", () => {
    expect(categoriaDoFormulario(form({ categoriaId: "cat-postagem-feed", link: "instagram.com/p/abc" }))).toEqual({
      categoriaId: "cat-postagem-feed",
      link: "https://instagram.com/p/abc",
    });
    expect(categoriaDoFormulario(form({ categoriaId: SEM_CATEGORIA, link: "  " }))).toEqual({ categoriaId: null, link: null });
    expect(categoriaDoFormulario(form({}))).toEqual({ categoriaId: null, link: null });
  });
});

describe("normalizarLink", () => {
  it("mantém http/https e completa o que veio sem protocolo", () => {
    expect(normalizarLink("https://www.instagram.com/p/x")).toBe("https://www.instagram.com/p/x");
    expect(normalizarLink("HTTP://site.com")).toBe("HTTP://site.com");
    expect(normalizarLink("www.site.com")).toBe("https://www.site.com");
    expect(normalizarLink(null)).toBeNull();
  });
});
