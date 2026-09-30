import { describe, expect, it } from "vitest";
import {
  avaliarDia,
  avaliarDiario,
  avaliarSemanal,
  execucaoDoPlano,
  percentualCumprimento,
  proximoDiaUtil,
  sequenciaDeDias,
  type CompromissoParaCalculo,
  type ContextoCalculo,
  type ResultadoCompromisso,
  type TarefaParaCompromisso,
} from "./compromissos";

// Horário de Brasília: b("2026-09-30 10:00")
const b = (s: string) => new Date(`${s.replace(" ", "T")}:00-03:00`);
const SEG_SEX = [1, 2, 3, 4, 5];
const versao = (desde: string, meta: number | null, extra: Partial<{ horarioCorte: string; diasUteis: number[] }> = {}) => ({
  vigenteDesde: b(`${desde} 00:00`),
  meta,
  diasUteis: extra.diasUteis ?? SEG_SEX,
  horarioCorte: extra.horarioCorte ?? null,
});

const GR: CompromissoParaCalculo = {
  id: "gr",
  nome: "Gerar Receita",
  frequencia: "DIARIA",
  regra: "CATEGORIA",
  categoriaId: "cat-gr",
  metaDeId: null,
  versoes: [versao("2026-09-28", 2), versao("2026-10-05", 3)],
};
const PLANEJAR: CompromissoParaCalculo = {
  id: "plan",
  nome: "Planejar o dia seguinte",
  frequencia: "DIARIA",
  regra: "PLANEJAR_DIA_SEGUINTE",
  categoriaId: "cat-gr",
  metaDeId: "gr",
  versoes: [versao("2026-09-28", null, { horarioCorte: "19:00" })],
};
const MELHORIA: CompromissoParaCalculo = {
  id: "mel",
  nome: "Melhoria",
  frequencia: "SEMANAL",
  regra: "CATEGORIA",
  categoriaId: "cat-mel",
  metaDeId: null,
  versoes: [versao("2026-09-28", 1)],
};
const TODOS = [GR, PLANEJAR, MELHORIA];

function tarefa(categoriaId: string, prazo: string, opcoes: { concluida?: string; definida?: string } = {}): TarefaParaCompromisso {
  return {
    categoriaId,
    prazo: b(prazo),
    concluidaEm: opcoes.concluida ? b(opcoes.concluida) : null,
    prazoDefinidoEm: b(opcoes.definida ?? "2026-09-28 08:00"),
  };
}
const ctx = (agora: string, tarefas: TarefaParaCompromisso[], compromissos = TODOS): ContextoCalculo => ({ agora: b(agora), tarefas, compromissos });

describe("critérios de aceite", () => {
  it("concluir uma tarefa com categoria conta na hora; reabrir desfaz", () => {
    const uma = [tarefa("cat-gr", "2026-09-30 10:00", { concluida: "2026-09-30 10:05" })];
    expect(avaliarDiario(GR, "2026-09-30", ctx("2026-09-30 11:00", uma))).toMatchObject({ realizado: 1, meta: 2, status: "andamento" });
    const duas = [...uma, tarefa("cat-gr", "2026-09-30 15:00", { concluida: "2026-09-30 15:30" })];
    expect(avaliarDiario(GR, "2026-09-30", ctx("2026-09-30 16:00", duas))).toMatchObject({ realizado: 2, status: "cumprido" });
    // reaberta: o banco limpa concluidaEm
    const reaberta = [uma[0], { ...duas[1], concluidaEm: null }];
    expect(avaliarDiario(GR, "2026-09-30", ctx("2026-09-30 16:00", reaberta))).toMatchObject({ realizado: 1, status: "andamento" });
  });

  it("tarefa concluída em outro dia conta no dia da conclusão, não no do prazo", () => {
    const atrasada = [tarefa("cat-gr", "2026-09-29 10:00", { concluida: "2026-09-30 09:00" })];
    const c = ctx("2026-09-30 20:00", atrasada);
    expect(avaliarDiario(GR, "2026-09-29", c)).toMatchObject({ realizado: 0, status: "nao_cumprido" });
    expect(avaliarDiario(GR, "2026-09-30", c)).toMatchObject({ realizado: 1 });
  });

  it("mudar a meta vale do período atual em diante e preserva o passado", () => {
    const duasPorDia = ["2026-10-02", "2026-10-06"].flatMap((d) => [
      tarefa("cat-gr", `${d} 10:00`, { concluida: `${d} 10:00` }),
      tarefa("cat-gr", `${d} 11:00`, { concluida: `${d} 11:00` }),
    ]);
    const c = ctx("2026-10-07 12:00", duasPorDia);
    expect(avaliarDiario(GR, "2026-10-02", c)).toMatchObject({ meta: 2, status: "cumprido" }); // meta da época
    expect(avaliarDiario(GR, "2026-10-06", c)).toMatchObject({ meta: 3, status: "nao_cumprido" });
  });

  it("compromisso novo entra no cálculo sem mudar código", () => {
    const posVenda: CompromissoParaCalculo = { ...GR, id: "pv", nome: "Pós-venda", categoriaId: "cat-pv", versoes: [versao("2026-09-30", 1)] };
    const tarefas = [tarefa("cat-pv", "2026-09-30 09:00", { concluida: "2026-09-30 09:30" })];
    const nomes = avaliarDia([...TODOS, posVenda], "2026-09-30", ctx("2026-09-30 10:00", tarefas, [...TODOS, posVenda])).map((r) => `${r.nome}:${r.status}`);
    expect(nomes).toContain("Pós-venda:cumprido");
  });
});

describe("planejar o dia seguinte", () => {
  it("conta só o que foi agendado até o corte, pro próximo dia útil, na quantidade da meta de Gerar Receita", () => {
    const umaAntes = [tarefa("cat-gr", "2026-10-01 09:00", { definida: "2026-09-30 17:00" })];
    expect(avaliarDiario(PLANEJAR, "2026-09-30", ctx("2026-09-30 18:00", umaAntes))).toMatchObject({
      realizado: 1,
      meta: 2,
      status: "andamento",
      diaAlvo: "2026-10-01",
    });
    const duasAntes = [...umaAntes, tarefa("cat-gr", "2026-10-01 14:00", { definida: "2026-09-30 18:30" })];
    expect(avaliarDiario(PLANEJAR, "2026-09-30", ctx("2026-09-30 18:40", duasAntes))).toMatchObject({ status: "cumprido" });
    // a segunda só foi agendada depois das 19h: não vale
    const umaDepois = [...umaAntes, tarefa("cat-gr", "2026-10-01 14:00", { definida: "2026-09-30 19:10" })];
    expect(avaliarDiario(PLANEJAR, "2026-09-30", ctx("2026-09-30 20:00", umaDepois))).toMatchObject({ realizado: 1, status: "nao_cumprido" });
  });

  it("na sexta planeja a segunda, com a meta que valerá na segunda", () => {
    const r = avaliarDiario(PLANEJAR, "2026-10-02", ctx("2026-10-02 10:00", []));
    expect(r).toMatchObject({ diaAlvo: "2026-10-05", meta: 3 });
    expect(proximoDiaUtil("2026-10-02", SEG_SEX)).toBe("2026-10-05");
    expect(proximoDiaUtil("2026-10-02", [1, 2, 3, 4, 5, 6])).toBe("2026-10-03");
  });
});

describe("semanal", () => {
  it("semana de segunda a domingo; em andamento até acabar", () => {
    const domingo = [tarefa("cat-mel", "2026-10-04 10:00", { concluida: "2026-10-04 10:00" })];
    expect(avaliarSemanal(MELHORIA, "2026-09-28", ctx("2026-10-04 12:00", domingo))).toMatchObject({ realizado: 1, status: "cumprido" });
    expect(avaliarSemanal(MELHORIA, "2026-09-28", ctx("2026-10-01 12:00", []))).toMatchObject({ status: "andamento" });
    expect(avaliarSemanal(MELHORIA, "2026-09-28", ctx("2026-10-05 12:00", []))).toMatchObject({ status: "nao_cumprido" });
  });
});

describe("sequência", () => {
  const soGr: CompromissoParaCalculo = { ...GR, versoes: [versao("2026-09-28", 2)] };
  const cumpridoNosDias = (dias: string[]) =>
    dias.flatMap((d) => [tarefa("cat-gr", `${d} 09:00`, { concluida: `${d} 09:00` }), tarefa("cat-gr", `${d} 10:00`, { concluida: `${d} 10:00` })]);
  it("conta dias úteis seguidos, pula fim de semana e não quebra com hoje em andamento", () => {
    const tarefas = cumpridoNosDias(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
    expect(sequenciaDeDias([soGr], ctx("2026-10-05 10:00", tarefas, [soGr]))).toBe(5);
  });
  it("para no primeiro dia não cumprido", () => {
    const tarefas = cumpridoNosDias(["2026-09-28", "2026-09-30", "2026-10-01"]);
    expect(sequenciaDeDias([soGr], ctx("2026-10-01 18:00", tarefas, [soGr]))).toBe(2);
  });
});

describe("percentuais e taxa do plano", () => {
  it("% ignora o que ainda está em andamento", () => {
    const r = (status: ResultadoCompromisso["status"]) => ({ compromissoId: "x", nome: "x", regra: "CATEGORIA" as const, realizado: 0, meta: 1, status });
    expect(percentualCumprimento([r("cumprido"), r("nao_cumprido"), r("andamento"), null])).toEqual({ cumpridos: 1, avaliados: 2 });
  });
  it("plano do dia = Gerar Receita com prazo no dia, agendada antes do dia; executada = concluída no dia", () => {
    const tarefas = [
      tarefa("cat-gr", "2026-10-01 09:00", { definida: "2026-09-30 18:00", concluida: "2026-10-01 09:30" }),
      tarefa("cat-gr", "2026-10-01 14:00", { definida: "2026-09-30 20:00" }),
      tarefa("cat-gr", "2026-10-01 16:00", { definida: "2026-10-01 08:00", concluida: "2026-10-01 16:00" }), // criada no dia: fora do plano
      tarefa("cat-mel", "2026-10-01 10:00", { definida: "2026-09-30 10:00" }), // outra categoria
    ];
    expect(execucaoDoPlano("cat-gr", "2026-10-01", tarefas)).toEqual({ planejadas: 2, executadas: 1 });
  });
});
