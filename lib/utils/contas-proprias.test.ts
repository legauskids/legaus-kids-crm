import { describe, expect, it } from "vitest";
import { contaPropriaDoPush, contaPropriaNoExtrato } from "./contas-proprias";

describe("contaPropriaDoPush (movimentação entre contas, 17/10/2026)", () => {
  it("Sicredi para a Idezza pelo CNPJ (push real de 08/10)", () => {
    expect(contaPropriaDoPush("Idezza Comercio Ltda", "56.135.764/0001-49")).toEqual({ chave: "IDEZZA", nome: "Idezza" });
  });
  it("Legaus pelo CNPJ ou pela razão social", () => {
    expect(contaPropriaDoPush("Outro Nome", "23.068.179/0001-14")?.chave).toBe("LEGAUS");
    expect(contaPropriaDoPush("Goldlog Fabrica E Transportes Ltda", null)?.chave).toBe("LEGAUS");
  });
  it("InfinitePay só traz o nome", () => {
    expect(contaPropriaDoPush("Idezza Comercio Ltda", null)?.chave).toBe("IDEZZA");
    expect(contaPropriaDoPush("Legaus Kids", null)?.chave).toBe("LEGAUS");
  });
  it("fornecedor, cliente ou pessoa física não é conta própria", () => {
    expect(contaPropriaDoPush("Marcos Zancan", "###.598.010-##")).toBeNull();
    expect(contaPropriaDoPush("Posto De Combustiveis Vaccari Ltda", "87.687.489/0001-08")).toBeNull();
    expect(contaPropriaDoPush(null, null)).toBeNull();
  });
});

describe("contaPropriaNoExtrato", () => {
  it("descrição do OFX do Sicredi com o CNPJ sem máscara", () => {
    expect(contaPropriaNoExtrato("PAGAMENTO PIX-PIX_DEB   56135764000149 IDEZZA COMERCIO LTDA")?.chave).toBe("IDEZZA");
    expect(contaPropriaNoExtrato("RECEBIMENTO PIX-CX350188  23068179000114 GOLDLOG FABRICA E TRANSPORTES")?.chave).toBe("LEGAUS");
  });
  it("pelo nome quando não vem o CNPJ", () => {
    expect(contaPropriaNoExtrato("TED RECEBIDA IDEZZA COMERCIO")?.chave).toBe("IDEZZA");
  });
  it("lançamentos comuns ficam de fora", () => {
    expect(contaPropriaNoExtrato("PAGAMENTO PIX-PIX_DEB   87687489000108 POSTO DE COMBUSTIVEIS VACCARI LTDA")).toBeNull();
    expect(contaPropriaNoExtrato("PAGAMENTO PIX-PIX_DEB   00359801099 MARCOS ZANCAN")).toBeNull();
    expect(contaPropriaNoExtrato("CESTA DE RELACIONAMENTO-")).toBeNull();
  });
});
