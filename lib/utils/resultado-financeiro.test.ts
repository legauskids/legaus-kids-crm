import { describe, expect, it } from "vitest";
import { calcularResultado, serieMensal, type TransacaoParaResultado } from "./resultado-financeiro";

const dia = (iso: string) => new Date(`${iso}T12:00:00-03:00`);
const semRateio = { negocioId: null, negocioTitulo: null, contatoNome: null, centroCustoId: null, centroCustoNome: null };

const transacoes: TransacaoParaResultado[] = [
  // Entrada de projeto (parcela do cliente) toda atribuída ao projeto A
  { data: dia("2026-09-02"), valorCentavos: 1_000_000, tipo: "ENTRADA", status: "CONCILIADA", rateios: [{ ...semRateio, valorCentavos: 1_000_000, negocioId: "A", negocioTitulo: "Playground A", contatoNome: "Cliente A" }] },
  // Compra de material dividida: 60% projeto A, 40% matéria-prima geral
  {
    data: dia("2026-09-03"),
    valorCentavos: 500_000,
    tipo: "SAIDA",
    status: "CONCILIADA",
    rateios: [
      { ...semRateio, valorCentavos: 300_000, negocioId: "A", negocioTitulo: "Playground A", contatoNome: "Cliente A" },
      { ...semRateio, valorCentavos: 200_000, centroCustoId: "mp", centroCustoNome: "Matéria-prima" },
    ],
  },
  // Tarifa classificada em centro de custo
  { data: dia("2026-09-05"), valorCentavos: 5_000, tipo: "SAIDA", status: "CONCILIADA", rateios: [{ ...semRateio, valorCentavos: 5_000, centroCustoId: "tar", centroCustoNome: "Tarifas" }] },
  // Saída metade classificada, metade a classificar
  { data: dia("2026-09-06"), valorCentavos: 100_000, tipo: "SAIDA", status: "NAO_CONCILIADA", rateios: [{ ...semRateio, valorCentavos: 50_000, centroCustoId: "tar", centroCustoNome: "Tarifas" }] },
  // Transferência entre contas — ignorada, não conta
  { data: dia("2026-09-07"), valorCentavos: 9_999_999, tipo: "SAIDA", status: "IGNORADA", rateios: [] },
  // Entrada sem classificação nenhuma
  { data: dia("2026-08-30"), valorCentavos: 20_000, tipo: "ENTRADA", status: "NAO_CONCILIADA", rateios: [] },
];

describe("calcularResultado", () => {
  const r = calcularResultado(transacoes);

  it("soma entradas e saídas (sem as ignoradas) e calcula resultado e margem", () => {
    expect(r.entradasCentavos).toBe(1_020_000);
    expect(r.saidasCentavos).toBe(605_000);
    expect(r.resultadoCentavos).toBe(415_000);
    expect(r.margemPercentual).toBe(40.7);
  });

  it("separa o que falta classificar", () => {
    expect(r.aClassificar).toEqual({ entradasCentavos: 20_000, saidasCentavos: 50_000, lancamentos: 2 });
  });

  it("monta a DRE gerencial", () => {
    expect(r.dre.receitaProjetosCentavos).toBe(1_000_000);
    expect(r.dre.custosProjetosCentavos).toBe(300_000);
    expect(r.dre.margemContribuicaoCentavos).toBe(700_000);
    expect(r.dre.despesasCentrosCentavos).toBe(255_000);
    // receitas + outras + a classificar - custos - despesas - a classificar = resultado
    const d = r.dre;
    expect(
      d.receitaProjetosCentavos + d.outrasReceitasCentavos + d.receitasAClassificarCentavos - d.custosProjetosCentavos - d.despesasCentrosCentavos - d.despesasAClassificarCentavos,
    ).toBe(r.resultadoCentavos);
  });

  it("agrupa despesas por centro de custo com percentual das saídas", () => {
    expect(r.despesasPorCentro.map((c) => [c.id, c.valorCentavos])).toEqual([
      ["mp", 200_000],
      ["tar", 55_000],
    ]);
    expect(r.despesasPorCentro[0].percentual).toBe(33.1);
  });

  it("calcula recebido, custos e margem por projeto", () => {
    expect(r.projetos).toEqual([
      { negocioId: "A", titulo: "Playground A", contatoNome: "Cliente A", recebidoCentavos: 1_000_000, custosCentavos: 300_000, margemCentavos: 700_000, margemPercentual: 70 },
    ]);
  });
});

describe("serieMensal", () => {
  it("agrupa por mês de Brasília e zera meses sem lançamento", () => {
    expect(serieMensal(transacoes, ["2026-07", "2026-08", "2026-09"])).toEqual([
      { mes: "2026-07", entradasCentavos: 0, saidasCentavos: 0, resultadoCentavos: 0 },
      { mes: "2026-08", entradasCentavos: 20_000, saidasCentavos: 0, resultadoCentavos: 20_000 },
      { mes: "2026-09", entradasCentavos: 1_000_000, saidasCentavos: 605_000, resultadoCentavos: 395_000 },
    ]);
  });
});
