// Histórico mensal de negócios ganhos e perdidos (pedido de 2026-10-01).
// O quadro de Negócios mostra em Ganho/Perdido só o mês atual; os meses
// anteriores ficam aqui — sem mover nada: o negócio continua na etapa, e o mês
// é o da entrada nela (dataEntradaNaEtapa), em horário de Brasília.

import { diaBrasilia } from "./brasilia";

const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export type NegocioFechado = {
  id: string;
  titulo: string;
  contatoNome: string | null;
  responsavelNome: string;
  valorCentavos: number;
  tipo: "GANHO" | "PERDIDO";
  /** Quando entrou em Ganho/Perdido. */
  data: Date;
  motivoPerda: string | null;
};

export type MesHistorico = {
  /** "AAAA-MM" */
  mes: string;
  rotulo: string;
  atual: boolean;
  ganhos: { qtd: number; valorCentavos: number; itens: NegocioFechado[] };
  perdidos: { qtd: number; valorCentavos: number; itens: NegocioFechado[]; motivos: { motivo: string; qtd: number }[] };
  /** ganhos / (ganhos + perdidos), 0 a 1; null sem negócio fechado. */
  conversao: number | null;
  ticketMedioCentavos: number | null;
};

/** "AAAA-MM" do mês (Brasília) em que o negócio foi ganho/perdido. */
export function mesDoFechamento(data: Date): string {
  return diaBrasilia(data).slice(0, 7);
}

export function rotuloMes(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  return `${NOMES_MES[m - 1]} de ${ano}`;
}

/** Motivos de perda agrupados (sem diferenciar maiúscula/espaço), do mais comum ao menos. */
export function agruparMotivos(perdidos: NegocioFechado[]): { motivo: string; qtd: number }[] {
  const mapa = new Map<string, { motivo: string; qtd: number }>();
  for (const n of perdidos) {
    const texto = n.motivoPerda?.trim() || "Sem motivo registrado";
    const chave = texto.toLowerCase().replace(/\s+/g, " ");
    const atual = mapa.get(chave);
    if (atual) atual.qtd++;
    else mapa.set(chave, { motivo: texto, qtd: 1 });
  }
  return [...mapa.values()].sort((a, b) => b.qtd - a.qtd || a.motivo.localeCompare(b.motivo));
}

/** Agrupa por mês do fechamento, do mais recente pro mais antigo; dentro do mês, mais recentes primeiro. */
export function agruparPorMes(negocios: NegocioFechado[], mesAtual: string): MesHistorico[] {
  const porMes = new Map<string, NegocioFechado[]>();
  for (const n of negocios) {
    const mes = mesDoFechamento(n.data);
    if (!porMes.has(mes)) porMes.set(mes, []);
    porMes.get(mes)!.push(n);
  }
  return [...porMes.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([mes, itens]) => {
      const ordenados = [...itens].sort((a, b) => b.data.getTime() - a.data.getTime());
      const ganhos = ordenados.filter((n) => n.tipo === "GANHO");
      const perdidos = ordenados.filter((n) => n.tipo === "PERDIDO");
      const valor = (lista: NegocioFechado[]) => lista.reduce((soma, n) => soma + n.valorCentavos, 0);
      const fechados = ganhos.length + perdidos.length;
      return {
        mes,
        rotulo: rotuloMes(mes),
        atual: mes === mesAtual,
        ganhos: { qtd: ganhos.length, valorCentavos: valor(ganhos), itens: ganhos },
        perdidos: { qtd: perdidos.length, valorCentavos: valor(perdidos), itens: perdidos, motivos: agruparMotivos(perdidos) },
        conversao: fechados > 0 ? ganhos.length / fechados : null,
        ticketMedioCentavos: ganhos.length > 0 ? Math.round(valor(ganhos) / ganhos.length) : null,
      };
    });
}
