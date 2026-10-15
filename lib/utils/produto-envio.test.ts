import { describe, expect, it } from "vitest";
import { caminhoArquivoProduto, caminhoArquivoProdutos, nomeArquivoProduto, textoEnvioProduto, textoEnvioProdutos } from "./produto-envio";

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

describe("vários produtos num PDF", () => {
  const p = (nome: string) => ({ nome });
  it("texto com os nomes (até 5) e quantos", () => {
    expect(textoEnvioProdutos([p("A"), p("B"), p("C")])).toBe("Segue o PDF com 3 produtos da Legaus Kids: A, B e C.");
    expect(textoEnvioProdutos(["A", "B", "C", "D", "E", "F", "G"].map(p))).toBe("Segue o PDF com 7 produtos da Legaus Kids: A, B, C, D, E e mais 2.");
    expect(textoEnvioProdutos([p("Só um")])).toBe("Segue a ficha do produto *Só um*.");
    expect(textoEnvioProdutos([p("A"), p("B")], " Oi! ")).toBe("Oi!");
  });
  it("rota com os ids na ordem e o preço oculto", () => {
    expect(caminhoArquivoProdutos(["b", "a"], false)).toBe("/api/pdf/produtos?ids=b%2Ca");
    expect(caminhoArquivoProdutos(["a"], true)).toBe("/api/pdf/produtos?ids=a&ocultarValor=1");
  });
});
