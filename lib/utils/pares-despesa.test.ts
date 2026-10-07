import { describe, expect, it } from "vitest";
import {
  candidatosDaLinha,
  diferencaDias,
  fornecedorDaDescricao,
  motivoDoPar,
  negocioSugeridoParaEntrada,
  palavrasEmComum,
} from "./pares-despesa";

const saida = (id: string, dia: string, valorCentavos: number, descricao: string) => ({ id, dia, valorCentavos, descricao, tipo: "SAIDA" as const });
const despesa = (id: string, dia: string, valorCentavos: number, fornecedor: string) => ({ id, dia, valorCentavos, fornecedor });

describe("candidatosDaLinha", () => {
  const linha = saida("l1", "2026-10-07", 25000, "COMPRA CARTAO DEB POSTO IPIRANGA");

  it("só casa valor exato dentro de 3 dias", () => {
    const despesas = [
      despesa("mesmo-dia", "2026-10-07", 25000, "Posto Ipiranga"),
      despesa("tres-dias", "2026-10-04", 25000, "Posto Ipiranga"),
      despesa("quatro-dias", "2026-10-03", 25000, "Posto Ipiranga"),
      despesa("valor-diferente", "2026-10-07", 25001, "Posto Ipiranga"),
      despesa("depois", "2026-10-10", 25000, "Outro"),
    ];
    expect(candidatosDaLinha(linha, despesas).map((c) => c.despesa.id)).toEqual(["mesmo-dia", "tres-dias", "depois"]);
  });

  it("ordena por fornecedor parecido e depois pela data mais próxima", () => {
    const despesas = [
      despesa("outro-perto", "2026-10-07", 25000, "Restaurante Sabor Gaúcho"),
      despesa("ipiranga-longe", "2026-10-05", 25000, "Posto Ipiranga"),
      despesa("outro-longe", "2026-10-05", 25000, "Ferragem Central"),
    ];
    const lista = candidatosDaLinha(linha, despesas);
    expect(lista.map((c) => c.despesa.id)).toEqual(["ipiranga-longe", "outro-perto", "outro-longe"]);
    expect(lista[0]).toMatchObject({ dias: 2, palavrasEmComum: 2 });
  });

  it("candidato descartado com 'Não é esse' não volta", () => {
    const despesas = [despesa("d1", "2026-10-07", 25000, "Posto Ipiranga"), despesa("d2", "2026-10-06", 25000, "Posto Shell")];
    expect(candidatosDaLinha(linha, despesas, new Set(["d1"])).map((c) => c.despesa.id)).toEqual(["d2"]);
  });

  it("entrada nunca tem par de despesa", () => {
    expect(candidatosDaLinha({ ...linha, tipo: "ENTRADA" }, [despesa("d1", "2026-10-07", 25000, "Posto Ipiranga")])).toEqual([]);
  });

  it("atravessa a virada do mês", () => {
    const l = saida("l2", "2026-10-01", 4000, "PIX");
    expect(candidatosDaLinha(l, [despesa("d", "2026-09-29", 4000, "X")])).toHaveLength(1);
    expect(diferencaDias("2026-09-29", "2026-10-01")).toBe(2);
  });
});

describe("palavrasEmComum", () => {
  it("ignora acento, maiúscula e palavra genérica", () => {
    expect(palavrasEmComum("Madeireira Pinheiro Ltda", "PIX ENVIADO MADEIREIRA PINHEIRO LTDA")).toBe(2);
    expect(palavrasEmComum("Comércio Silva", "COMERCIO SOUZA")).toBe(0);
  });

  it("abreviação do extrato conta (REST = Restaurante)", () => {
    expect(palavrasEmComum("Restaurante Sabor Gaúcho", "COMPRA CARTAO DEB REST SABOR GAUCHO")).toBe(3);
  });

  it("aceita palavra cortada no fim da descrição do Sicredi", () => {
    expect(palavrasEmComum("Schossler Construções", "PAGAMENTO PIX SCHOSSLER COMERCIO DE MATERIAIS DE CONSTR")).toBe(2);
  });
});

describe("motivoDoPar", () => {
  it("explica o par", () => {
    expect(motivoDoPar({ dias: 0, palavrasEmComum: 2 })).toBe("Mesmo valor, mesma data, fornecedor parecido");
    expect(motivoDoPar({ dias: 1, palavrasEmComum: 0 }, 2)).toBe("Mesmo valor, 1 dia de diferença, 2 despesas possíveis");
    expect(motivoDoPar({ dias: 3, palavrasEmComum: 0 })).toBe("Mesmo valor, 3 dias de diferença");
  });
});

describe("negocioSugeridoParaEntrada", () => {
  const entrada = { descricao: "PIX RECEBIDO COND RES BELA VISTA", valorCentavos: 650000, tipo: "ENTRADA" as const };
  it("valor único sugere o negócio", () => {
    const n = [{ id: "a", valorCentavos: 650000, contatoNome: "Condomínio Bela Vista" }, { id: "b", valorCentavos: 100, contatoNome: null }];
    expect(negocioSugeridoParaEntrada(entrada, n)?.id).toBe("a");
  });
  it("vários com o mesmo valor: desempata pelo nome do cliente na descrição", () => {
    const n = [
      { id: "a", valorCentavos: 650000, contatoNome: "Escola Arco-Íris" },
      { id: "b", valorCentavos: 650000, contatoNome: "Condomínio Bela Vista" },
    ];
    expect(negocioSugeridoParaEntrada(entrada, n)?.id).toBe("b");
    expect(negocioSugeridoParaEntrada({ ...entrada, descricao: "PIX RECEBIDO" }, n)).toBeNull();
  });
  it("saída não sugere negócio", () => {
    expect(negocioSugeridoParaEntrada({ ...entrada, tipo: "SAIDA" }, [{ id: "a", valorCentavos: 650000, contatoNome: null }])).toBeNull();
  });
});

describe("fornecedorDaDescricao", () => {
  it("tira o prefixo do banco e o CNPJ", () => {
    expect(fornecedorDaDescricao("PAGAMENTO PIX-PIX_DEB   87687489000108 POSTO DE COMBUSTIVEIS VACCARI LTDA")).toBe("Posto de Combustiveis Vaccari");
    expect(fornecedorDaDescricao("PAGAMENTO PIX-CX981725  41119789087 ADELCO ANTONIO FUHR")).toBe("Adelco Antonio Fuhr");
    expect(fornecedorDaDescricao("CESTA DE RELACIONAMENTO-")).toBe("Cesta de Relacionamento");
  });
});
