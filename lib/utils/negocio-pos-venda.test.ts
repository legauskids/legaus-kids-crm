import { describe, expect, it } from "vitest";
import { renomeacaoDoPar, semSufixoPosVenda, semVendaComPosVenda } from "./negocio-pos-venda";

describe("renomear venda e pós-venda juntos", () => {
  it("venda: o pós-venda acompanha, com o sufixo", () => {
    expect(renomeacaoDoPar({ atual: "Playground Arco-Íris", novo: "  Playground   Escola Arco-Íris ", ehPosVenda: false })).toEqual({
      titulo: "Playground Escola Arco-Íris",
      gemeoAtual: "Playground Arco-Íris — Pós-venda",
      gemeoNovo: "Playground Escola Arco-Íris — Pós-venda",
    });
  });
  it("pós-venda: o sufixo fica, mesmo se apagado; a venda acompanha sem ele", () => {
    const esperado = { titulo: "Playground Escola — Pós-venda", gemeoAtual: "Playground", gemeoNovo: "Playground Escola" };
    expect(renomeacaoDoPar({ atual: "Playground — Pós-venda", novo: "Playground Escola — Pós-venda", ehPosVenda: true })).toEqual(esperado);
    expect(renomeacaoDoPar({ atual: "Playground — Pós-venda", novo: "Playground Escola", ehPosVenda: true })).toEqual(esperado);
  });
  it("pós-venda sem o sufixo (criado à mão): sem par", () => {
    expect(renomeacaoDoPar({ atual: "Manutenção", novo: "Manutenção FEMA", ehPosVenda: true })).toEqual({ titulo: "Manutenção FEMA", gemeoAtual: null, gemeoNovo: null });
  });
  it("tira o sufixo", () => {
    expect(semSufixoPosVenda("X — Pós-venda")).toBe("X");
    expect(semSufixoPosVenda("X")).toBe("X");
    expect(semSufixoPosVenda(" — Pós-venda")).toBe("");
    expect(semSufixoPosVenda("— Pós-venda")).toBe("");
    expect(renomeacaoDoPar({ atual: "X — Pós-venda", novo: " — Pós-venda", ehPosVenda: true }).titulo).toBe(" — Pós-venda");
  });
});

describe("semVendaComPosVenda", () => {
  it("tira o de venda quando a cópia de pós-venda do mesmo cliente está na lista", () => {
    const n = [
      { id: "venda", titulo: "Manutenção FEMA", contatoNome: "FEMA" },
      { id: "pos", titulo: "Manutenção FEMA — Pós-venda", contatoNome: "FEMA" },
      { id: "outro", titulo: "Kidplay Escola Ijuí", contatoNome: "Kidplay" },
    ];
    expect(semVendaComPosVenda(n).map((x) => x.id)).toEqual(["pos", "outro"]);
  });

  it("mantém o de venda sem pós-venda, e o de outro cliente com o mesmo título", () => {
    const n = [
      { id: "a", titulo: "Playground", contatoNome: "Escola A" },
      { id: "b", titulo: "Playground", contatoNome: "Escola B" },
      { id: "b-pos", titulo: "Playground — Pós-venda", contatoNome: "Escola B" },
    ];
    expect(semVendaComPosVenda(n).map((x) => x.id)).toEqual(["a", "b-pos"]);
  });
});
