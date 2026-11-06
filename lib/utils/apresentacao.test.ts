import { describe, expect, it } from "vitest";
import {
  apresentacaoPadrao,
  imagensUsadas,
  normalizarPaginas,
  novaPagina,
  paginasDoCliente,
  resolverPagina,
  semImagem,
  textosAutomaticos,
  type OrcamentoParaApresentacao,
} from "./apresentacao";

const item = (nome: string, valorUnitarioCentavos: number, fotoUrl: string | null = null, quantidade = 1) => ({
  nome,
  descricao: null,
  quantidade,
  valorUnitarioCentavos,
  fotoUrl,
});

const orcamento = (itens: OrcamentoParaApresentacao["itens"], extra: Partial<OrcamentoParaApresentacao> = {}): OrcamentoParaApresentacao => ({
  numero: 42,
  cliente: "Escola da Paz",
  validoAte: "21/11/2026",
  descontoCentavos: 0,
  observacoes: null,
  itens,
  ...extra,
});

describe("apresentacaoPadrao", () => {
  it("segue o modelo e cria uma página de modelo por item com foto", () => {
    const paginas = apresentacaoPadrao(orcamento([item("Playground", 1000000, "/f1"), item("Frete", 50000), item("Kidplay", 2000000, "/f2")]));
    expect(paginas.map((p) => p.id)).toEqual([
      "capa",
      "sobre",
      "portfolio",
      "clientes",
      "ecossistema",
      "como-funciona",
      "projeto",
      "modelo-0",
      "modelo-2",
      "investimento",
      "contato",
    ]);
    expect(paginas.find((p) => p.tipo === "investimento")?.incluir).toBe(true);
    // "Projeto realizado" fica de fora até ganhar fotos.
    expect(paginasDoCliente(paginas).some((p) => p.tipo === "projeto")).toBe(false);
  });

  it("sem foto, usa o primeiro item; um item só não precisa do resumo do investimento", () => {
    const paginas = apresentacaoPadrao(orcamento([item("Playground", 1000000)]));
    expect(paginas.filter((p) => p.tipo === "modelo").map((p) => p.id)).toEqual(["modelo-0"]);
    expect(paginas.find((p) => p.tipo === "investimento")?.incluir).toBe(false);
  });
});

describe("textos automáticos", () => {
  it("capa diz para quem é a proposta", () => {
    expect(textosAutomaticos(novaPagina("capa", "c"), orcamento([]))).toEqual({ proposta: "Proposta para Escola da Paz · Orçamento nº 0042" });
    expect(textosAutomaticos(novaPagina("capa", "c"), orcamento([], { cliente: null }))).toEqual({ proposta: "Orçamento nº 0042" });
  });

  it("modelo usa o total quando é o único item e o subtotal do item quando há vários", () => {
    const um = orcamento([item("Playground", 1000000, null, 2)], { descontoCentavos: 100000 });
    const auto = textosAutomaticos(novaPagina("modelo", "m", 0), um);
    expect(auto.modelo).toBe("Playground (2 unidades)");
    expect(auto.investimento).toMatch(/19\.000,00/);

    const varios = orcamento([item("Playground", 1000000), item("Kidplay", 300000)]);
    expect(textosAutomaticos(novaPagina("modelo", "m", 1), varios).investimento).toMatch(/3\.000,00/);
  });

  it("campo preenchido vence o automático", () => {
    const pagina = { ...novaPagina("modelo", "m", 0), modelo: "Playground Tropical" };
    const resolvida = resolverPagina(pagina, orcamento([item("Playground", 1000000)]));
    expect(resolvida).toMatchObject({ modelo: "Playground Tropical", investimento: expect.stringMatching(/10\.000,00/) });
  });
});

describe("normalizarPaginas", () => {
  it("descarta o que não reconhece, ids repetidos e corta textos longos", () => {
    const paginas = normalizarPaginas([
      { id: "a", tipo: "capa", incluir: false, titulo: "x".repeat(500), subtitulo: 3 },
      { id: "a", tipo: "contato" },
      { id: "b", tipo: "desconhecido" },
      { id: "c", tipo: "galeria", imagens: ["i1", "i1", "i2", "i3", "i4", "i5"] },
    ]);
    expect(paginas).toHaveLength(2);
    expect(paginas?.[0]).toMatchObject({ tipo: "capa", incluir: false, subtitulo: "" });
    expect((paginas?.[0] as { titulo: string }).titulo).toHaveLength(120);
    expect(paginas?.[1]).toMatchObject({ tipo: "galeria", incluir: true, imagens: ["i1", "i2", "i3", "i4"] });
  });

  it("nada aproveitável vira null", () => {
    expect(normalizarPaginas(null)).toBeNull();
    expect(normalizarPaginas([{ tipo: "capa" }])).toBeNull();
  });
});

describe("imagens", () => {
  it("lista as usadas e tira de todas as páginas a que foi excluída", () => {
    const paginas = [
      { ...novaPagina("projeto", "p"), imagens: ["i1", "i2"] },
      { ...novaPagina("galeria", "g"), imagens: ["i2"] },
      novaPagina("capa", "c"),
    ];
    expect(imagensUsadas(paginas)).toEqual(["i1", "i2"]);
    const sem = semImagem(paginas, "i2");
    expect(imagensUsadas(sem)).toEqual(["i1"]);
    // Galeria sem imagem não vai para o cliente.
    expect(paginasDoCliente(sem).map((p) => p.id)).toEqual(["p", "c"]);
  });
});
