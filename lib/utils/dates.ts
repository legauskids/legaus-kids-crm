export function diasDesde(data: Date): number {
  const ms = Date.now() - data.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function negocioParadoAlemDoPrazo(input: {
  slaDias: number | null;
  dataEntradaNaEtapa: Date;
}): boolean {
  if (input.slaDias == null) return false;
  return diasDesde(input.dataEntradaNaEtapa) > input.slaDias;
}

export function isHoje(data: Date): boolean {
  const hoje = new Date();
  return (
    data.getFullYear() === hoje.getFullYear() &&
    data.getMonth() === hoje.getMonth() &&
    data.getDate() === hoje.getDate()
  );
}

export function tarefaAtrasada(prazo: Date, status: string): boolean {
  return status !== "CONCLUIDA" && prazo.getTime() < Date.now();
}

export function tarefaVenceHoje(prazo: Date, status: string): boolean {
  return status !== "CONCLUIDA" && !tarefaAtrasada(prazo, status) && isHoje(prazo);
}

export type CorPrazo = "atrasada" | "hoje" | "normal";

export function corPrazoTarefa(prazo: Date, status: string): CorPrazo {
  if (tarefaAtrasada(prazo, status)) return "atrasada";
  if (tarefaVenceHoje(prazo, status)) return "hoje";
  return "normal";
}

export type ColunaTarefa = "A_FAZER" | "EM_ANDAMENTO" | "APROVACAO" | "ATRASADA" | "CONCLUIDA";

export function colunaKanbanTarefa(prazo: Date, status: string): ColunaTarefa {
  if (status === "CONCLUIDA") return "CONCLUIDA";
  if (tarefaAtrasada(prazo, status)) return "ATRASADA";
  return status as ColunaTarefa;
}

export type CorPrazoData = "atrasada" | "hoje" | "normal";

/**
 * Campos de "só data" (previsão de produção, data de instalação) vêm de
 * <input type="date"> — `new Date("2026-08-28")` grava isso como meia-noite
 * UTC. Ler essa data com getters locais (toLocaleDateString, isSameDay do
 * date-fns, isHoje) desloca um dia pra trás em fusos atrás de UTC como o do
 * Brasil (28/08 vira 27/08 às 21h). Os getters UTC decodificam de volta a
 * data-calendário pretendida; "hoje"/o dia do calendário continuam locais,
 * porque isso É o que importa pro usuário.
 */
function partesDataCalendario(data: Date): { ano: number; mes: number; dia: number } {
  return { ano: data.getUTCFullYear(), mes: data.getUTCMonth(), dia: data.getUTCDate() };
}

export function formatarDataCalendario(data: Date): string {
  const { ano, mes, dia } = partesDataCalendario(data);
  return `${String(dia).padStart(2, "0")}/${String(mes + 1).padStart(2, "0")}/${ano}`;
}

/** `diaLocal` é um dia de calendário (ex. vindo de eachDayOfInterval), não uma data-só-dia salva. */
export function isMesmoDiaCalendario(dataSalva: Date, diaLocal: Date): boolean {
  const p = partesDataCalendario(dataSalva);
  return p.ano === diaLocal.getFullYear() && p.mes === diaLocal.getMonth() && p.dia === diaLocal.getDate();
}

export function corPrazoData(data: Date): CorPrazoData {
  const p = partesDataCalendario(data);
  const hoje = new Date();
  const dataNum = p.ano * 10000 + p.mes * 100 + p.dia;
  const hojeNum = hoje.getFullYear() * 10000 + hoje.getMonth() * 100 + hoje.getDate();
  if (dataNum === hojeNum) return "hoje";
  if (dataNum < hojeNum) return "atrasada";
  return "normal";
}

export type Periodo = "hoje" | "semana" | "mes";

export function estaNoPeriodo(data: Date, periodo: Periodo): boolean {
  const agora = new Date();
  if (periodo === "hoje") return isHoje(data);

  if (periodo === "semana") {
    const diaSemana = agora.getDay(); // 0 = domingo
    const inicio = new Date(agora);
    inicio.setDate(agora.getDate() - diaSemana);
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date(inicio);
    fim.setDate(inicio.getDate() + 7);
    return data >= inicio && data < fim;
  }

  return data.getFullYear() === agora.getFullYear() && data.getMonth() === agora.getMonth();
}
