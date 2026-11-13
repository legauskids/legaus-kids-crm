import { describe, expect, it } from "vitest";
import { EMPRESA } from "../constants/empresa";
import {
  MODELO_PADRAO_CONTRATO,
  cnpjValido,
  cpfValido,
  dadosContratoSchema,
  errosPorCampo,
  lerDadosContrato,
  lerValorEmReais,
  mesclarModelo,
  nomeProprio,
  numeroPorExtenso,
  separarContrato,
  valorPorExtenso,
  valoresDoContrato,
  type DadosContrato,
} from "./contrato";

const PF: DadosContrato = {
  empresaEmissora: "LEGAUS",
  clienteTipo: "PF",
  clienteNome: "Monique Rochneski Girua",
  clienteDocumento: "52998224725",
  clienteEndereco: "Rua das Flores, 123, Centro",
  clienteCidade: "Giruá",
  clienteUf: "RS",
  clienteCep: "98870000",
  representanteNome: "",
  representanteCpf: "",
  produto: "Playground Torre Dupla",
  especificacoes: "",
  valorCentavos: 1_580_000,
  formaPagamento: "Entrada de R$ 5.000,00 na assinatura e saldo na entrega.",
  prazoEntregaDias: 30,
  garantiaMeses: 6,
  localInstalacao: "",
};

const EXTRAS = { negocioTitulo: "Monique", clienteTelefone: null, previsaoEntrega: null, previsaoInstalacao: null, hoje: new Date("2026-11-12T15:00:00Z") };

describe("texto do contrato", () => {
  it("separa título, seções e parágrafos mesmo com quebra de linha do Windows", () => {
    const { titulo, blocos } = separarContrato("Contrato X\r\n\r\nDas partes\r\n\r\n1 - Dos termos:\r\n\r\n1.1) Objeto: algo");
    expect(titulo).toBe("Contrato X");
    expect(blocos).toEqual([
      { tipo: "paragrafo", texto: "Das partes" },
      { tipo: "secao", texto: "1 - Dos termos:" },
      { tipo: "paragrafo", texto: "1.1) Objeto: algo" },
    ]);
  });

  it("mescla os campos e limpa o que ficou vazio", () => {
    expect(mesclarModelo("A {{x}} B.\n\n{{vazio}}\n\nC {{y}} , fim", { x: "um", vazio: "", y: "dois" })).toBe("A um B.\n\nC dois, fim");
    expect(mesclarModelo("Fica {{desconhecido}}", {})).toBe("Fica {{desconhecido}}");
  });
});

describe("por extenso", () => {
  it.each([
    [1, "um"],
    [16, "dezesseis"],
    [30, "trinta"],
    [100, "cem"],
    [101, "cento e um"],
    [1000, "mil"],
    [1001, "mil e um"],
    [1234, "mil duzentos e trinta e quatro"],
    [15800, "quinze mil e oitocentos"],
    [80430, "oitenta mil quatrocentos e trinta"],
    [1_200_000, "um milhão e duzentos mil"],
    [2_000_500, "dois milhões e quinhentos"],
  ])("%i → %s", (n, esperado) => expect(numeroPorExtenso(n)).toBe(esperado));

  it("valores em reais", () => {
    expect(valorPorExtenso(1_580_000)).toBe("quinze mil e oitocentos reais");
    expect(valorPorExtenso(100)).toBe("um real");
    expect(valorPorExtenso(150)).toBe("um real e cinquenta centavos");
    expect(valorPorExtenso(1)).toBe("um centavo");
    expect(valorPorExtenso(100_000_000)).toBe("um milhão de reais");
    expect(valorPorExtenso(8_043_000)).toBe("oitenta mil quatrocentos e trinta reais");
  });
});

describe("nomes", () => {
  it("tira o tudo-maiúsculo e deixa siglas e números", () => {
    expect(nomeProprio("GOLDLOG FABRICA E TRANSPORTES LTDA")).toBe("Goldlog Fabrica e Transportes Ltda");
    expect(nomeProprio("MARCOS ZANCAN")).toBe("Marcos Zancan");
    expect(nomeProprio("AV. TUPARENDI, 659, SALA 01")).toBe("Av. Tuparendi, 659, Sala 01");
    expect(nomeProprio("ACPM EMEI MADRE TEREZA - RS")).toBe("ACPM EMEI Madre Tereza - RS");
    expect(nomeProprio("SÃO JOÃO DO OESTE")).toBe("São João do Oeste");
  });

  it("não mexe no que já foi digitado em caixa mista", () => {
    expect(nomeProprio("Escola da Ana LTDA")).toBe("Escola da Ana LTDA");
  });
});

describe("documentos e valor", () => {
  it("confere os dígitos do CPF e do CNPJ", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("529.982.247-24")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cnpjValido("23.068.179/0001-14")).toBe(true);
    expect(cnpjValido("23.068.179/0001-15")).toBe(false);
  });

  it("lê o valor digitado", () => {
    expect(lerValorEmReais("15.800,00")).toBe(1_580_000);
    expect(lerValorEmReais("R$ 15800")).toBe(1_580_000);
    expect(lerValorEmReais("15.800")).toBe(1_580_000);
    expect(lerValorEmReais("1580.5")).toBe(158_050);
    expect(lerValorEmReais("abc")).toBeNull();
    expect(lerValorEmReais("")).toBeNull();
  });
});

describe("formulário", () => {
  it("pessoa física pede CPF válido; jurídica pede CNPJ e quem assina", () => {
    expect(dadosContratoSchema.safeParse(PF).success).toBe(true);
    const semCpf = dadosContratoSchema.safeParse({ ...PF, clienteDocumento: "123" });
    expect(semCpf.success).toBe(false);
    if (!semCpf.success) expect(errosPorCampo(semCpf.error.issues).clienteDocumento).toMatch(/CPF inválido/);

    const pj = dadosContratoSchema.safeParse({ ...PF, clienteTipo: "PJ", clienteDocumento: "23.068.179/0001-14" });
    expect(pj.success).toBe(false);
    if (!pj.success) expect(Object.keys(errosPorCampo(pj.error.issues)).sort()).toEqual(["representanteCpf", "representanteNome"]);
  });

  it("lê os dados guardados mesmo incompletos", () => {
    expect(lerDadosContrato(null)).toBeNull();
    const lido = lerDadosContrato({ clienteNome: "Ana", valorCentavos: "x" });
    expect(lido?.clienteNome).toBe("Ana");
    expect(lido?.valorCentavos).toBe(0);
    expect(lido?.prazoEntregaDias).toBe(30);
    expect(lido?.clienteTipo).toBe("PF");
  });
});

describe("modelo padrão preenchido", () => {
  it("pessoa física, sem maiúsculas sobrando", () => {
    const texto = mesclarModelo(MODELO_PADRAO_CONTRATO, valoresDoContrato(PF, EMPRESA, EXTRAS));
    const { titulo, blocos } = separarContrato(texto);
    expect(titulo).toBe("Contrato particular de compra e venda");
    expect(texto).toContain("Goldlog Fabrica e Transportes Ltda, pessoa jurídica de direito privado");
    expect(texto).toContain("representada pelo seu proprietário Marcos Zancan");
    expect(texto).toContain(
      "Monique Rochneski Girua, pessoa física, inscrita no CPF sob o nº 529.982.247-25, residente e domiciliada na Rua das Flores, 123, Centro, na cidade de Giruá/RS, CEP 98870-000, doravante denominada simplesmente Comprador.",
    );
    expect(texto).toContain("seguinte bem: Playground Torre Dupla, conforme modelo e especificações apresentados e aprovados pelo Comprador. Para isso");
    expect(texto).toContain("a soma de R$ 15.800,00 (quinze mil e oitocentos reais), entrada de R$ 5.000,00 na assinatura e saldo na entrega.");
    expect(texto).toContain("é de até 30 (trinta) dias corridos, contados");
    expect(texto).toContain("prazo de 6 (seis) meses de garantia");
    expect(texto).toContain("A montagem do brinquedo, a ser realizada no local indicado pelo Comprador, será");
    expect(texto.endsWith("Santa Rosa/RS, 12 de novembro de 2026.")).toBe(true);
    expect(texto).not.toMatch(/\{\{|\[não informado\]/);
    expect(blocos.filter((b) => b.tipo === "secao").map((b) => b.texto)).toEqual([
      "1 - Dos termos do presente contrato:",
      "2 - Da mora e do inadimplemento:",
      "3 - Da sucessão:",
      "4 - Do foro:",
      "5 - Do consentimento:",
    ]);
    // Nenhuma palavra comum toda em maiúsculas (só siglas como CNPJ, CPF, RS, IGP-M, FGV).
    const gritadas = texto.match(/\b[A-ZÀ-Ú]{4,}\b/g) ?? [];
    expect(gritadas.filter((p) => !["CNPJ", "IGP"].includes(p))).toEqual([]);
  });

  it("pessoa jurídica com representante, especificações e local", () => {
    const pj: DadosContrato = {
      ...PF,
      clienteTipo: "PJ",
      clienteNome: "Escola Pequeno Príncipe Ltda",
      clienteDocumento: "23068179000114",
      representanteNome: "Ana Souza",
      representanteCpf: "52998224725",
      especificacoes: "torre em madeira plástica\ncom escorregador",
      localInstalacao: "Rua B, 45, Santa Rosa/RS",
      prazoEntregaDias: 1,
      garantiaMeses: 1,
    };
    const texto = mesclarModelo(MODELO_PADRAO_CONTRATO, valoresDoContrato(pj, EMPRESA, EXTRAS));
    expect(texto).toContain(
      "Escola Pequeno Príncipe Ltda, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 23.068.179/0001-14, sediada na Rua das Flores, 123, Centro, na cidade de Giruá/RS, CEP 98870-000, neste ato representada por Ana Souza, portador(a) do CPF nº 529.982.247-25, doravante denominada simplesmente Comprador.",
    );
    expect(texto).toContain("aprovados pelo Comprador. Especificações: Torre em madeira plástica. Com escorregador. Para isso");
    expect(texto).toContain("até 1 (um) dia corrido,");
    expect(texto).toContain("prazo de 1 (um) mês de garantia");
    expect(texto).toContain("a ser realizada em Rua B, 45, Santa Rosa/RS, será");
  });
});
