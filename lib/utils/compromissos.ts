// Regras puras do módulo Compromissos (metas recorrentes de hábitos de gestão,
// pedido de 2026-09-30) — períodos e histórico de metas. Tudo em horário de
// Brasília; semana de segunda a domingo. Dados vêm de lib/server/compromissos.ts.

import { diaBrasilia, inicioDaSemana, inicioDoDiaBrasilia } from "./brasilia";

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
