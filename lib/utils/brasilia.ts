// Datas no horário de Brasília — o servidor (Vercel) roda em UTC, então "hoje",
// "início da semana" etc. sempre passam por aqui. -03:00 fixo: o Brasil não
// tem mais horário de verão. Dias como texto "AAAA-MM-DD".

/** "AAAA-MM-DD" do dia em Brasília. */
export function diaBrasilia(data: Date): string {
  return data.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Meia-noite de Brasília do dia "AAAA-MM-DD". */
export function inicioDoDiaBrasilia(diaIso: string): Date {
  return new Date(`${diaIso}T00:00:00-03:00`);
}

/** Dia da semana de um dia de calendário: 0 = domingo ... 6 = sábado. */
export function diaDaSemana(diaIso: string): number {
  return new Date(`${diaIso}T12:00:00Z`).getUTCDay();
}

export function somarDias(diaIso: string, dias: number): string {
  const d = new Date(`${diaIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Segunda-feira da semana (segunda a domingo) do dia. */
export function inicioDaSemana(diaIso: string): string {
  return somarDias(diaIso, -((diaDaSemana(diaIso) + 6) % 7));
}
