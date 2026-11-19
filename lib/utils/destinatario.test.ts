import { describe, expect, it } from "vitest";
import { destinatarioDoContato, tipoBuscaDestinatario } from "./destinatario";

describe("tipoBuscaDestinatario (pedido de 2026-11-17)", () => {
  it("texto busca pelo nome", () => {
    expect(tipoBuscaDestinatario("Monique")).toEqual({ tipo: "nome" });
    expect(tipoBuscaDestinatario("Escola 2")).toEqual({ tipo: "nome" });
  });
  it("de 4 a 9 números é o final do telefone (os 8 últimos no máximo)", () => {
    expect(tipoBuscaDestinatario("6980")).toEqual({ tipo: "final", digitos: "6980" });
    expect(tipoBuscaDestinatario(" 2-6980 ")).toEqual({ tipo: "final", digitos: "26980" });
    expect(tipoBuscaDestinatario("9 9696-0296")).toEqual({ tipo: "final", digitos: "96960296" });
  });
  it("10 números ou mais é o telefone inteiro", () => {
    expect(tipoBuscaDestinatario("(54) 99696-0296")).toEqual({ tipo: "telefone" });
    expect(tipoBuscaDestinatario("5554996960296")).toEqual({ tipo: "telefone" });
  });
  it("pouca coisa não busca", () => {
    expect(tipoBuscaDestinatario("")).toBeNull();
    expect(tipoBuscaDestinatario("a")).toBeNull();
    expect(tipoBuscaDestinatario("698")).toBeNull();
  });
});

describe("destinatarioDoContato", () => {
  it("cliente com telefone já vem escolhido; sem telefone, não", () => {
    expect(destinatarioDoContato({ id: "c1", nome: "Ana", telefone: "5554996960296" })).toMatchObject({ contatoId: "c1", nome: "Ana", telefone: "5554996960296" });
    expect(destinatarioDoContato({ id: "c2", nome: "Bia", telefone: null })).toBeNull();
    expect(destinatarioDoContato(null)).toBeNull();
  });
});
