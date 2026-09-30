// Regras puras do módulo Compromissos (metas recorrentes de hábitos de gestão,
// pedido de 2026-09-30) — períodos e histórico de metas. Tudo em horário de
// Brasília; semana de segunda a domingo. Dados vêm de lib/server/compromissos.ts.

import { diaBrasilia, diaDaSemana, inicioDaSemana, inicioDoDiaBrasilia, somarDias } from "./brasilia";

export type Frequencia = "DIARIA" | "SEMANAL";

export type VersaoCompromisso = {
  vigenteDesde: Date;
  meta: number | null;
  /** 0 = domingo ... 6 = sábado */
  diasUteis: number[];
  horarioCorte: string | null;
};

export const NOMES_DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Início (meia-noite de Brasília) do dia ou da semana que contém o instante. */
export function inicioDoPeriodo(frequencia: Frequencia, instante: Date): Date {
  const dia = diaBrasilia(instante);
  return inicioDoDiaBrasilia(frequencia === "DIARIA" ? dia : inicioDaSemana(dia));
}

/**
 * Versão da configuração que vale para o período que começa em inicioPeriodo:
 * a de maior vigenteDesde que já estava valendo. null = o compromisso ainda
 * não existia nesse período (não entra no histórico nem na sequência).
 */
export function versaoVigente<T extends { vigenteDesde: Date }>(versoes: T[], inicioPeriodo: Date): T | null {
  let melhor: T | null = null;
  for (const v of versoes) {
    if (v.vigenteDesde.getTime() <= inicioPeriodo.getTime() && (!melhor || v.vigenteDesde.getTime() > melhor.vigenteDesde.getTime())) {
      melhor = v;
    }
  }
  return melhor;
}

/**
 * Onde gravar uma mudança de meta/dias/corte feita agora: se a versão mais
 * recente já começa no período atual, ela é corrigida no lugar (mudar duas vezes
 * no mesmo dia não cria duas versões); senão nasce uma versão nova valendo do
 * início do período atual — os períodos anteriores continuam com a meta da época.
 */
export function destinoDaAlteracao(
  frequencia: Frequencia,
  versoes: { id: string; vigenteDesde: Date }[],
  agora: Date,
): { tipo: "atualizar"; id: string } | { tipo: "criar"; vigenteDesde: Date } {
  const inicio = inicioDoPeriodo(frequencia, agora);
  const maisRecente = versoes.reduce<{ id: string; vigenteDesde: Date } | null>(
    (acc, v) => (!acc || v.vigenteDesde.getTime() > acc.vigenteDesde.getTime() ? v : acc),
    null,
  );
  if (maisRecente && maisRecente.vigenteDesde.getTime() >= inicio.getTime()) return { tipo: "atualizar", id: maisRecente.id };
  return { tipo: "criar", vigenteDesde: inicio };
}

/** "HH:MM" válido (00:00 a 23:59). */
export function horarioValido(valor: string | null | undefined): boolean {
  return !!valor && /^([01]\d|2[0-3]):[0-5]\d$/.test(valor);
}

// ---------------------------------------------------------------------------
// Cálculo (etapa 4). Tudo a partir das tarefas: concluir conta, reabrir desfaz
// (concluidaEm é mantido pelo banco); conta no DIA DA CONCLUSÃO, não no prazo.
// ---------------------------------------------------------------------------

export type StatusCompromisso = "cumprido" | "andamento" | "nao_cumprido";

/** Tarefas JÁ filtradas pela pessoa (responsável). */
export type TarefaParaCompromisso = {
  categoriaId: string | null;
  prazo: Date;
  concluidaEm: Date | null;
  prazoDefinidoEm: Date;
};

export type CompromissoParaCalculo = {
  id: string;
  nome: string;
  frequencia: Frequencia;
  regra: "CATEGORIA" | "PLANEJAR_DIA_SEGUINTE";
  categoriaId: string | null;
  metaDeId: string | null;
  versoes: VersaoCompromisso[];
};

export type ContextoCalculo = {
  /** Todos os compromissos (inclusive os de outras pessoas) — pra achar a meta espelhada (metaDe). */
  compromissos: CompromissoParaCalculo[];
  tarefas: TarefaParaCompromisso[];
  agora: Date;
};

export type ResultadoCompromisso = {
  compromissoId: string;
  nome: string;
  regra: CompromissoParaCalculo["regra"];
  realizado: number;
  meta: number;
  status: StatusCompromisso;
  /** PLANEJAR_DIA_SEGUINTE: dia planejado e horário de corte. */
  diaAlvo?: string;
  horarioCorte?: string;
};

function instanteNoDia(dia: string, hhmm: string): Date {
  return new Date(`${dia}T${hhmm}:00-03:00`);
}

/** Próximo dia (depois de `dia`) que está entre os dias considerados. */
export function proximoDiaUtil(dia: string, diasUteis: number[]): string {
  for (let i = 1; i <= 7; i++) {
    const d = somarDias(dia, i);
    if (diasUteis.includes(diaDaSemana(d))) return d;
  }
  return somarDias(dia, 1);
}

/** Meta de um compromisso num dia (a versão que valia naquele dia). */
function metaNoDia(c: CompromissoParaCalculo, dia: string): number | null {
  return versaoVigente(c.versoes, inicioDoDiaBrasilia(dia))?.meta ?? null;
}

function metaExigidaPlanejar(c: CompromissoParaCalculo, versao: VersaoCompromisso, dia: string, alvo: string, ctx: ContextoCalculo): number {
  if (c.metaDeId) {
    const base = ctx.compromissos.find((x) => x.id === c.metaDeId);
    // A meta que vai valer no dia planejado (ou, se ainda não houver versão lá, a de hoje).
    const meta = base ? (metaNoDia(base, alvo) ?? metaNoDia(base, dia)) : null;
    if (meta !== null) return meta;
  }
  return versao.meta ?? 1;
}

/** Compromisso diário num dia; null = não se aplica (antes de existir, dia não considerado ou futuro). */
export function avaliarDiario(c: CompromissoParaCalculo, dia: string, ctx: ContextoCalculo): ResultadoCompromisso | null {
  const hoje = diaBrasilia(ctx.agora);
  if (dia > hoje) return null;
  const versao = versaoVigente(c.versoes, inicioDoDiaBrasilia(dia));
  if (!versao || !versao.diasUteis.includes(diaDaSemana(dia))) return null;
  const base = { compromissoId: c.id, nome: c.nome, regra: c.regra };

  if (c.regra === "PLANEJAR_DIA_SEGUINTE") {
    const corteHhmm = versao.horarioCorte ?? "23:59";
    const corte = instanteNoDia(dia, corteHhmm);
    const alvo = proximoDiaUtil(dia, versao.diasUteis);
    const meta = metaExigidaPlanejar(c, versao, dia, alvo, ctx);
    // Planejada = da categoria, com prazo no próximo dia útil e prazo definido até o corte.
    const realizado = ctx.tarefas.filter(
      (t) => t.categoriaId === c.categoriaId && diaBrasilia(t.prazo) === alvo && t.prazoDefinidoEm.getTime() <= corte.getTime(),
    ).length;
    const status: StatusCompromisso = realizado >= meta ? "cumprido" : ctx.agora.getTime() < corte.getTime() ? "andamento" : "nao_cumprido";
    return { ...base, realizado, meta, status, diaAlvo: alvo, horarioCorte: corteHhmm };
  }

  const meta = versao.meta ?? 1;
  const realizado = ctx.tarefas.filter((t) => t.categoriaId === c.categoriaId && t.concluidaEm && diaBrasilia(t.concluidaEm) === dia).length;
  const status: StatusCompromisso = realizado >= meta ? "cumprido" : dia === hoje ? "andamento" : "nao_cumprido";
  return { ...base, realizado, meta, status };
}

/** Compromisso semanal na semana que começa em `segunda` (AAAA-MM-DD); null = não se aplica. */
export function avaliarSemanal(c: CompromissoParaCalculo, segunda: string, ctx: ContextoCalculo): ResultadoCompromisso | null {
  const hoje = diaBrasilia(ctx.agora);
  if (segunda > hoje) return null;
  const versao = versaoVigente(c.versoes, inicioDoDiaBrasilia(segunda));
  if (!versao) return null;
  const fim = somarDias(segunda, 7);
  const meta = versao.meta ?? 1;
  const realizado = ctx.tarefas.filter((t) => {
    if (t.categoriaId !== c.categoriaId || !t.concluidaEm) return false;
    const d = diaBrasilia(t.concluidaEm);
    return d >= segunda && d < fim;
  }).length;
  const status: StatusCompromisso = realizado >= meta ? "cumprido" : hoje < fim ? "andamento" : "nao_cumprido";
  return { compromissoId: c.id, nome: c.nome, regra: c.regra, realizado, meta, status };
}

/** Todos os compromissos diários que se aplicam ao dia. */
export function avaliarDia(compromissos: CompromissoParaCalculo[], dia: string, ctx: ContextoCalculo): ResultadoCompromisso[] {
  return compromissos
    .filter((c) => c.frequencia === "DIARIA")
    .map((c) => avaliarDiario(c, dia, ctx))
    .filter((r): r is ResultadoCompromisso => r !== null);
}

/** Estado de um dia na grade: todos cumpridos, algum não cumprido, ainda em andamento ou sem compromisso. */
export function estadoDoDia(resultados: ResultadoCompromisso[]): StatusCompromisso | "sem" {
  if (resultados.length === 0) return "sem";
  if (resultados.every((r) => r.status === "cumprido")) return "cumprido";
  if (resultados.some((r) => r.status === "nao_cumprido")) return "nao_cumprido";
  return "andamento";
}

/**
 * Sequência de dias com TODOS os compromissos diários cumpridos, de hoje pra
 * trás. Hoje ainda em andamento não quebra (nem conta); dia sem compromisso
 * (fora dos dias considerados) é pulado.
 */
export function sequenciaDeDias(compromissos: CompromissoParaCalculo[], ctx: ContextoCalculo, limiteDias = 400): number {
  const diarios = compromissos.filter((c) => c.frequencia === "DIARIA");
  const inicios = diarios.flatMap((c) => c.versoes.map((v) => diaBrasilia(v.vigenteDesde)));
  if (inicios.length === 0) return 0;
  const primeiroDia = inicios.sort()[0];
  let dia = diaBrasilia(ctx.agora);
  let n = 0;
  for (let i = 0; i < limiteDias && dia >= primeiroDia; i++, dia = somarDias(dia, -1)) {
    const estado = estadoDoDia(avaliarDia(diarios, dia, ctx));
    if (estado === "sem" || estado === "andamento") continue;
    if (estado === "nao_cumprido") break;
    n++;
  }
  return n;
}

/** % de cumprimento: só conta período encerrado ou já cumprido (o de hoje em andamento não pesa contra). */
export function percentualCumprimento(resultados: (ResultadoCompromisso | null)[]): { cumpridos: number; avaliados: number } {
  let cumpridos = 0;
  let avaliados = 0;
  for (const r of resultados) {
    if (!r || r.status === "andamento") continue;
    avaliados++;
    if (r.status === "cumprido") cumpridos++;
  }
  return { cumpridos, avaliados };
}

/**
 * Taxa de execução do plano num dia: das tarefas da categoria (Gerar Receita)
 * com prazo no dia e agendadas ANTES do dia (na véspera ou antes — inclusive
 * pelo "Planejar amanhã"), quantas foram concluídas no próprio dia.
 */
export function execucaoDoPlano(categoriaId: string, dia: string, tarefas: TarefaParaCompromisso[]): { planejadas: number; executadas: number } {
  const inicio = inicioDoDiaBrasilia(dia).getTime();
  const planejadas = tarefas.filter((t) => t.categoriaId === categoriaId && diaBrasilia(t.prazo) === dia && t.prazoDefinidoEm.getTime() < inicio);
  return {
    planejadas: planejadas.length,
    executadas: planejadas.filter((t) => t.concluidaEm && diaBrasilia(t.concluidaEm) === dia).length,
  };
}
