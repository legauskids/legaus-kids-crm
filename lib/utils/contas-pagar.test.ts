import { describe, expect, it } from "vitest";
import {
  agruparContas,
  dataBR,
  diaDoMes,
  filtroContasDaUrl,
  filtroVazio,
  fimDoMes,
  grupoDaConta,
  horizonteDasFixas,
  mimeAnexoConta,
  parametrosDoFiltro,
  planilhaContas,
  prazoLegivel,
  proximosVencimentosFixos,
  rotuloParcela,
  situacaoLegivel,
  somarMeses,
  totaisPor,
  vencimentosDasParcelas,
} from "./contas-pagar";

describe("datas das contas a pagar (pedido de 2026-11-23)", () => {
  it("dia 31 vira o último dia nos meses curtos", () => {
    expect(diaDoMes(2026, 2, 31)).toBe("2026-02-28");
    expect(diaDoMes(2028, 2, 31)).toBe("2028-02-29");
    expect(diaDoMes(2026, 4, 31)).toBe("2026-04-30");
    expect(diaDoMes(2026, 12, 5)).toBe("2026-12-05");
  });

  it("soma meses virando o ano e guardando o dia escolhido", () => {
    expect(somarMeses("2026-11-10", 1)).toBe("2026-12-10");
    expect(somarMeses("2026-12-10", 1)).toBe("2027-01-10");
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    // Depois de fevereiro, volta para o 31 (não fica preso no 28).
    expect(somarMeses("2026-02-28", 1, 31)).toBe("2026-03-31");
    expect(somarMeses("2026-11-10", -11)).toBe("2025-12-10");
  });

  it("fim do mês e horizonte das fixas (fim do mês que vem)", () => {
    expect(fimDoMes("2026-11-23")).toBe("2026-11-30");
    expect(horizonteDasFixas("2026-11-23")).toBe("2026-12-31");
    expect(horizonteDasFixas("2026-12-01")).toBe("2027-01-31");
    expect(horizonteDasFixas("2027-01-31")).toBe("2027-02-28");
  });

  it("conta fixa: cria os meses que faltam até o horizonte", () => {
    expect(proximosVencimentosFixos("2026-12-10", 10, "2026-12-31")).toEqual([]);
    expect(proximosVencimentosFixos("2026-11-25", 25, "2026-12-31")).toEqual(["2026-12-25"]);
    expect(proximosVencimentosFixos("2026-12-31", 31, "2027-03-31")).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
    // Sistema parado por muito tempo: nunca mais de 24 de uma vez.
    expect(proximosVencimentosFixos("2020-01-10", 10, "2030-12-31")).toHaveLength(24);
  });

  it("parcelas: uma por mês no dia da primeira", () => {
    expect(vencimentosDasParcelas("2026-11-30", 4)).toEqual(["2026-11-30", "2026-12-30", "2027-01-30", "2027-02-28"]);
    expect(vencimentosDasParcelas("2026-11-10", 1)).toEqual(["2026-11-10"]);
    expect(rotuloParcela(2, 10)).toBe("2/10");
    expect(rotuloParcela(null, null)).toBeNull();
  });

  it("prazo em palavras", () => {
    expect(prazoLegivel("2026-11-23", "2026-11-23")).toBe("vence hoje");
    expect(prazoLegivel("2026-11-24", "2026-11-23")).toBe("vence amanhã");
    expect(prazoLegivel("2026-12-03", "2026-11-23")).toBe("vence em 10 dias");
    expect(prazoLegivel("2026-11-22", "2026-11-23")).toBe("venceu ontem");
    expect(prazoLegivel("2026-11-01", "2026-11-23")).toBe("venceu há 22 dias");
  });
});

describe("grupos do relatório", () => {
  const hoje = "2026-11-23";
  const aberta = (vencimento: string, valorCentavos = 100) => ({ status: "ABERTA" as const, vencimento, valorCentavos });

  it("atrasadas, hoje, 7 dias, resto do mês, depois e pagas", () => {
    expect(grupoDaConta(aberta("2026-11-22"), hoje)).toBe("ATRASADAS");
    expect(grupoDaConta(aberta("2026-11-23"), hoje)).toBe("HOJE");
    expect(grupoDaConta(aberta("2026-11-24"), hoje)).toBe("SETE_DIAS");
    expect(grupoDaConta(aberta("2026-11-30"), hoje)).toBe("SETE_DIAS");
    expect(grupoDaConta(aberta("2026-12-01"), hoje)).toBe("DEPOIS");
    expect(grupoDaConta(aberta("2026-11-20"), "2026-11-05")).toBe("MES");
    expect(grupoDaConta({ ...aberta("2026-11-01"), status: "PAGA" }, hoje)).toBe("PAGAS");
  });

  it("agrupa na ordem, soma cada grupo e deixa de fora os vazios", () => {
    const grupos = agruparContas(
      [aberta("2026-12-10", 300), aberta("2026-11-20", 100), aberta("2026-11-10", 50), { ...aberta("2026-11-01", 70), status: "PAGA" as const }, { ...aberta("2026-11-15", 30), status: "PAGA" as const }],
      hoje,
    );
    expect(grupos.map((g) => g.grupo)).toEqual(["ATRASADAS", "DEPOIS", "PAGAS"]);
    expect(grupos[0].contas.map((c) => c.vencimento)).toEqual(["2026-11-10", "2026-11-20"]);
    expect(grupos[0].totalCentavos).toBe(150);
    // Pagas: a mais recente primeiro.
    expect(grupos[2].contas.map((c) => c.vencimento)).toEqual(["2026-11-15", "2026-11-01"]);
  });

  it("totais por categoria, o maior primeiro", () => {
    const totais = totaisPor(
      [
        { valorCentavos: 100, cat: "Energia" },
        { valorCentavos: 500, cat: "Aluguel" },
        { valorCentavos: 50, cat: "Energia" },
      ],
      (c) => c.cat,
    );
    expect(totais).toEqual([
      { nome: "Aluguel", quantidade: 1, totalCentavos: 500 },
      { nome: "Energia", quantidade: 2, totalCentavos: 150 },
    ]);
  });

  it("situação: aberta e vencida é Atrasada", () => {
    expect(situacaoLegivel(aberta("2026-11-22"), hoje)).toBe("Atrasada");
    expect(situacaoLegivel(aberta("2026-11-23"), hoje)).toBe("Em aberto");
    expect(situacaoLegivel({ ...aberta("2026-11-01"), status: "PAGA" }, hoje)).toBe("Paga");
  });
});

describe("filtro da URL", () => {
  it("padrão: abertas, sem período", () => {
    const f = filtroContasDaUrl({});
    expect(f).toEqual({ situacao: "ABERTAS", de: null, ate: null, categoriaId: null, centro: null, fornecedor: null });
    expect(filtroVazio(f)).toBe(true);
    expect(parametrosDoFiltro(f).toString()).toBe("");
  });

  it("ida e volta, e ignora valor inválido", () => {
    const f = filtroContasDaUrl({ situacao: "PAGAS", de: "2026-11-01", ate: "2026-11-30", categoria: "c1", centro: "n:neg1", fornecedor: " RGE " });
    expect(f.fornecedor).toBe("RGE");
    expect(filtroContasDaUrl(Object.fromEntries(parametrosDoFiltro(f)))).toEqual(f);
    expect(filtroVazio(f)).toBe(false);
    const ruim = filtroContasDaUrl({ situacao: "x", de: "01/11/2026", centro: "abc" });
    expect(ruim.situacao).toBe("ABERTAS");
    expect(ruim.de).toBeNull();
    expect(ruim.centro).toBeNull();
  });
});

describe("anexo e planilha", () => {
  it("aceita só foto e PDF", () => {
    expect(mimeAnexoConta("application/pdf", "boleto.pdf")).toBe("application/pdf");
    expect(mimeAnexoConta("", "fatura.PDF")).toBe("application/pdf");
    expect(mimeAnexoConta("image/jpeg", "foto.jpg")).toBe("image/jpeg");
    expect(mimeAnexoConta("", "IMG_1.HEIC")).toBe("image/heic");
    expect(mimeAnexoConta("image/svg+xml", "x.svg")).toBeNull();
    expect(mimeAnexoConta("text/html", "x.html")).toBeNull();
  });

  it("planilha para o Excel em português: BOM, ponto e vírgula e vírgula nos centavos", () => {
    const csv = planilhaContas([
      {
        vencimento: "2026-12-10",
        fornecedor: 'RGE "Sul"; energia',
        descricao: "=HYPERLINK(1)",
        parcela: "2/10",
        categoria: "Energia",
        centro: "Administrativo",
        valorCentavos: 123456,
        situacao: "Em aberto",
        pagaEm: null,
        codigoPagamento: "8366 0000",
      },
    ]);
    expect(csv.startsWith("﻿Vencimento;Fornecedor;")).toBe(true);
    const linha = csv.split("\r\n")[1];
    expect(linha).toBe(`10/12/2026;"RGE ""Sul""; energia";'=HYPERLINK(1);2/10;Energia;Administrativo;1234,56;Em aberto;;8366 0000`);
    expect(dataBR("2026-01-05")).toBe("05/01/2026");
  });
});
