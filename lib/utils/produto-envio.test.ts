import { describe, expect, it } from "vitest";
import { caminhoArquivoProduto, nomeArquivoProduto, textoEnvioProduto } from "./produto-envio";

const kidplay = { nome: "Kidplay Loja", valorCentavos: 2390000 };

describe("textoEnvioProduto", () => {
  it("card e PDF com o preço", () => {
    expect(textoEnvioProduto(kidplay, "CARD", false)).toMatch(/^\*Kidplay Loja\* — R\$\s23\.900,00$/);
    expect(textoEnvioProduto(kidplay, "PDF", false)).toMatch(/^Segue a ficha do produto \*Kidplay Loja\* — R\$\s23\.900,00\.$/);
  });
  it("preço oculto ou produto sem preço não mostra valor", () => {
    expect(textoEnvioProduto(kidplay, "CARD", true)).toBe("*Kidplay Loja*");
    expect(textoEnvioProduto({ nome: "Balanço", valorCentavos: null }, "PDF", false)).toBe("Segue a ficha do produto *Balanço*.");
  });
  it("mensagem escrita pela pessoa substitui o padrão", () => {
    expect(textoEnvioProduto(kidplay, "PDF", false, "  Olá Renata, segue o kidplay que conversamos.  ")).toBe("Olá Renata, segue o kidplay que conversamos.");
  });
});

describe("nomeArquivoProduto e caminhoArquivoProduto", () => {
  it("nome do arquivo sem acento nem espaço", () => {
    expect(nomeArquivoProduto("Playground 1 Torre com Tubo + Balanço", "PDF")).toBe("playground-1-torre-com-tubo-balanco.pdf");
    expect(nomeArquivoProduto("Kidplay Loja", "CARD")).toBe("kidplay-loja.jpg");
  });
  it("rota do arquivo, com ou sem preço", () => {
    expect(caminhoArquivoProduto("abc", "CARD", false)).toBe("/api/imagem/produto-card/abc");
    expect(caminhoArquivoProduto("abc", "PDF", true)).toBe("/api/pdf/produto/abc?ocultarValor=1");
  });
});
