import { describe, expect, it } from "vitest";
import { semVendaComPosVenda } from "./negocio-pos-venda";

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
