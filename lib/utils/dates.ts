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
