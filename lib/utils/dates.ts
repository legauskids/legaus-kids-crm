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
