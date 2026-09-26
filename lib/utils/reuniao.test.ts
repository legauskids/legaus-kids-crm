import { describe, expect, it } from "vitest";
import {
  dataCalendarioNoIntervalo,
  periodosDaReuniao,
  rotuloPeriodo,
  sinaisDeAtencao,
  tituloPadraoReuniao,
  type ResumoReuniao,
} from "./reuniao";

const iso = (d: Date) => d.toISOString();

describe("periodosDaReuniao", () => {
  it("semanal: 7 dias antes da reunião e 7 dias a partir dela, à meia-noite de Brasília", () => {
    // segunda 28/09/2026 às 9h (Brasília)
    const p = periodosDaReuniao("SEMANAL", new Date("2026-09-28T09:00:00-03:00"));
    expect(iso(p.periodoInicio)).toBe("2026-09-21T03:00:00.000Z");
    expect(iso(p.periodoFim)).toBe("2026-09-28T03:00:00.000Z");
    expect(iso(p.proximoInicio)).toBe("2026-09-28T03:00:00.000Z");
    expect(iso(p.proximoFim)).toBe("2026-10-05T03:00:00.000Z");
  });

  it("semanal às 22h de domingo em Brasília (já segunda em UTC) continua no domingo", () => {
    const p = periodosDaReuniao("SEMANAL", new Date("2026-09-27T22:00:00-03:00"));
    expect(iso(p.periodoFim)).toBe("2026-09-27T03:00:00.000Z");
  });

  it("mensal até o dia 15 analisa o mês anterior (e cruza o ano)", () => {
    const p = periodosDaReuniao("MENSAL", new Date("2027-01-05T10:00:00-03:00"));
    expect(iso(p.periodoInicio)).toBe("2026-12-01T03:00:00.000Z");
    expect(iso(p.periodoFim)).toBe("2027-01-01T03:00:00.000Z");
    expect(iso(p.proximoFim)).toBe("2027-02-01T03:00:00.000Z");
  });

  it("mensal depois do dia 15 analisa o próprio mês e projeta o seguinte", () => {
    const p = periodosDaReuniao("MENSAL", new Date("2026-09-29T10:00:00-03:00"));
    expect(iso(p.periodoInicio)).toBe("2026-09-01T03:00:00.000Z");
    expect(iso(p.proximoInicio)).toBe("2026-10-01T03:00:00.000Z");
    expect(iso(p.proximoFim)).toBe("2026-11-01T03:00:00.000Z");
  });
});

describe("dataCalendarioNoIntervalo", () => {
  it("data só-dia gravada à meia-noite UTC cai no dia certo da semana de Brasília", () => {
    const s = periodosDaReuniao("SEMANAL", new Date("2026-09-28T09:00:00-03:00"));
    // input type=date "2026-09-28" -> 2026-09-28T00:00Z (21h do dia 27 em Brasília)
    expect(dataCalendarioNoIntervalo(new Date("2026-09-28"), s.proximoInicio, s.proximoFim)).toBe(true);
    expect(dataCalendarioNoIntervalo(new Date("2026-09-28"), s.periodoInicio, s.periodoFim)).toBe(false);
    expect(dataCalendarioNoIntervalo(new Date("2026-10-04"), s.proximoInicio, s.proximoFim)).toBe(true);
    expect(dataCalendarioNoIntervalo(new Date("2026-10-05"), s.proximoInicio, s.proximoFim)).toBe(false);
  });
});

describe("rótulos", () => {
  it("mês cheio vira nome do mês; semana vira intervalo com o último dia incluso", () => {
    const m = periodosDaReuniao("MENSAL", new Date("2026-10-02T10:00:00-03:00"));
    expect(rotuloPeriodo(m.periodoInicio, m.periodoFim)).toBe("setembro de 2026");
    const s = periodosDaReuniao("SEMANAL", new Date("2026-09-28T09:00:00-03:00"));
    expect(rotuloPeriodo(s.periodoInicio, s.periodoFim)).toBe("21/09 a 27/09");
    expect(tituloPadraoReuniao("SEMANAL", new Date("2026-09-28T09:00:00-03:00"))).toBe("Reunião semanal — 28/09");
    expect(tituloPadraoReuniao("MENSAL", new Date("2026-10-02T10:00:00-03:00"))).toBe("Reunião mensal — setembro de 2026");
  });
});

function resumoBase(): ResumoReuniao {
  const links = {
    funilVenda: "/negocios?funil=v",
    funilPosVenda: "/negocios?funil=p",
    parados: "/negocios?parados=1",
    tarefasAtrasadas: "/tarefas?status=ATRASADA",
    aprovacoes: "/tarefas?status=APROVACAO",
    financeiro: "/financeiro?aba=dashboard",
    conciliacao: "/financeiro?aba=conciliacao",
    producao: "/producao",
    atendimento: "/atendimento",
    dashboard: "/",
  };
  return {
    geradoEm: "2026-09-28T12:00:00.000Z",
    periodo: { inicio: "", fim: "", rotulo: "" },
    proximo: { inicio: "", fim: "", rotulo: "" },
    links,
    vendas: {
      ganhos: { qtd: 1, valorCentavos: 1000000, itens: [] },
      perdidos: { qtd: 0, valorCentavos: 0, itens: [] },
      novosNegocios: { qtd: 2, valorCentavos: 0 },
      leads: { conversasNovas: 3, contatosNovos: 1 },
    },
    pipeline: {
      emNegociacao: { qtd: 0, valorCentavos: 0 },
      emFechamento: { qtd: 0, valorCentavos: 0, itens: [] },
      parados: { qtd: 0, valorCentavos: 0, itens: [] },
      previsaoVencida: { qtd: 0, valorCentavos: 0, itens: [] },
      etapas: [],
    },
    meta: null,
    financeiro: {
      entradasCentavos: 100,
      saidasCentavos: 50,
      resultadoCentavos: 50,
      aClassificarQtd: 0,
      aClassificarCentavos: 0,
      ultimoLancamento: "2026-09-27T12:00:00.000Z",
    },
    posVenda: { etapas: [], emPagamento: { qtd: 0, valorCentavos: 0 } },
    tarefas: { concluidasNoPeriodo: 0, atrasadas: 0, aprovacoesPendentes: 0 },
    compromissos: { abertos: [], concluidosNoPeriodo: 0 },
    perspectiva: {
      fechamentosPrevistos: { qtd: 0, valorCentavos: 0, itens: [] },
      emFechamentoSemPrevisao: 0,
      instalacoes: { qtd: 0, itens: [] },
      producaoPrevista: { qtd: 0, itens: [] },
      tarefasComPrazo: 0,
      compromissosVencendo: 0,
      metaProximoMesCentavos: null,
    },
  };
}

const AGORA = new Date("2026-09-28T12:00:00.000Z");

describe("sinaisDeAtencao", () => {
  it("tudo em dia não levanta nada", () => {
    expect(sinaisDeAtencao(resumoBase(), AGORA)).toEqual([]);
  });

  it("ordena alta antes de média e informativo, cada sinal com link", () => {
    const r = resumoBase();
    r.perspectiva.instalacoes = { qtd: 1, itens: [] };
    r.financeiro.aClassificarQtd = 28;
    r.financeiro.resultadoCentavos = -500;
    r.compromissos.abertos = [
      { id: "t1", titulo: "Ligar pro fornecedor", responsavelNome: "Dani", prazo: "2026-09-20T12:00:00.000Z", status: "A_FAZER", atrasado: true, reuniaoId: "r0", reuniaoTitulo: "Reunião semanal — 21/09" },
    ];
    const sinais = sinaisDeAtencao(r, AGORA);
    expect(sinais.map((s) => s.chave)).toEqual(["compromissos_atrasados", "resultado_negativo", "extrato_a_classificar", "instalacoes_previstas"]);
    expect(sinais[0].detalhe).toContain("Ligar pro fornecedor (Dani)");
    expect(sinais.every((s) => s.href.length > 0)).toBe(true);
  });

  it("meta só é sinal quando o atingido fica mais de 10 pontos atrás do mês decorrido", () => {
    const r = resumoBase();
    r.meta = { rotuloMes: "setembro", alvoCentavos: 5000000, ganhoCentavos: 2000000, percentualAtingido: 40, percentualDoMes: 45 };
    expect(sinaisDeAtencao(r, AGORA).map((s) => s.chave)).not.toContain("meta_abaixo_do_ritmo");
    r.meta.percentualDoMes = 93;
    expect(sinaisDeAtencao(r, AGORA)[0].chave).toBe("meta_abaixo_do_ritmo");
  });

  it("parados: 3 ou mais (ou muito valor) é prioridade alta", () => {
    const r = resumoBase();
    r.pipeline.parados = { qtd: 1, valorCentavos: 100000, itens: [] };
    expect(sinaisDeAtencao(r, AGORA)[0]).toMatchObject({ chave: "negocios_parados", nivel: "media" });
    r.pipeline.parados.qtd = 3;
    expect(sinaisDeAtencao(r, AGORA)[0]).toMatchObject({ chave: "negocios_parados", nivel: "alta" });
  });

  it("previsão de fechamento vencida vira sinal com os negócios", () => {
    const r = resumoBase();
    r.pipeline.previsaoVencida = {
      qtd: 1,
      valorCentavos: 450000,
      itens: [{ id: "n", titulo: "Manutenção FEMA", contatoNome: null, valorCentavos: 450000, detalhe: "previsão 24/09/2026" }],
    };
    expect(sinaisDeAtencao(r, AGORA)[0]).toMatchObject({ chave: "previsao_vencida", nivel: "media" });
    expect(sinaisDeAtencao(r, AGORA)[0].detalhe).toBe("Manutenção FEMA (previsão 24/09/2026)");
  });

  it("extrato sem lançamento há mais de 7 dias, sem leads e mais perdas que ganhos", () => {
    const r = resumoBase();
    r.financeiro.ultimoLancamento = "2026-09-14T12:00:00.000Z";
    r.vendas.leads = { conversasNovas: 0, contatosNovos: 0 };
    r.vendas.perdidos = { qtd: 2, valorCentavos: 10, itens: [{ id: "n", titulo: "Parque X", contatoNome: null, valorCentavos: 10, detalhe: "preço" }] };
    const chaves = sinaisDeAtencao(r, AGORA).map((s) => s.chave);
    expect(chaves).toEqual(expect.arrayContaining(["extrato_desatualizado", "sem_leads", "mais_perdas_que_ganhos"]));
    expect(sinaisDeAtencao(r, AGORA).find((s) => s.chave === "extrato_desatualizado")?.titulo).toContain("14/09");
  });
});
