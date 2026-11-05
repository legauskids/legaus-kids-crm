import { describe, expect, it } from "vitest";
import { filtrarClientes, formatarDocumento, type ClienteBuscavel } from "./busca-cliente";

const c = (id: string, extra: Partial<ClienteBuscavel>): ClienteBuscavel => ({
  id,
  nome: id,
  empresa: null,
  razaoSocial: null,
  cnpj: null,
  cpf: null,
  telefone: null,
  tipo: "CONTATO",
  ...extra,
});

const clientes = [
  c("escola", { nome: "Escola Pequeno Príncipe", razaoSocial: "Associação Educacional São João Ltda", cnpj: "12.345.678/0001-90", tipo: "CLIENTE" }),
  c("joao", { nome: "João da Silva", telefone: "5554999112233" }),
  c("maria", { nome: "Maria Souza", empresa: "Prefeitura de Vacaria", cpf: "123.456.789-09", tipo: "CLIENTE" }),
  c("joana", { nome: "Joana Prado", telefone: "5554988776655" }),
];
const ids = (termo: string) => filtrarClientes(clientes, termo).map((x) => x.id);

describe("filtrarClientes", () => {
  it("por nome, sem ligar pra acento nem maiúscula", () => {
    expect(ids("joao")).toEqual(["joao", "escola"]); // a escola tem "São João" na razão social
    expect(ids("JOÃO SILVA")).toEqual(["joao"]);
    expect(ids("jo")).toEqual(["joana", "joao", "escola"]); // nome começando por "jo" primeiro; "São João" só na razão social
  });
  it("por empresa ou razão social", () => {
    expect(ids("prefeitura")).toEqual(["maria"]);
    expect(ids("educacional sao joao")).toEqual(["escola"]);
  });
  it("por CNPJ ou CPF, com ou sem pontuação, inteiro ou começo", () => {
    expect(ids("12345678000190")).toEqual(["escola"]);
    expect(ids("12.345.678/0001-90")).toEqual(["escola"]);
    expect(ids("123.456.789-09")).toEqual(["maria"]);
    expect(ids("12345")).toEqual(["escola", "maria"]);
  });
  it("por telefone", () => {
    expect(ids("99911")).toEqual(["joao"]);
    expect(ids("(54) 98877")).toEqual(["joana"]);
  });
  it("vazio ou nada parecido: lista vazia", () => {
    expect(ids("  ")).toEqual([]);
    expect(ids("xyz")).toEqual([]);
  });
});

describe("formatarDocumento", () => {
  it("CPF e CNPJ com máscara; o resto como veio", () => {
    expect(formatarDocumento("12345678909")).toBe("123.456.789-09");
    expect(formatarDocumento("12345678000190")).toBe("12.345.678/0001-90");
    expect(formatarDocumento("123")).toBe("123");
    expect(formatarDocumento(null)).toBeNull();
  });
});
