import "server-only";
import { prisma } from "@/lib/db";
import { diaBrasilia, inicioDoDiaBrasilia } from "@/lib/utils/brasilia";
import { agruparPorMes, mesDoFechamento, type MesHistorico } from "@/lib/utils/historico-negocios";

// Guia Histórico de Negócios (pedido de 2026-10-01): ganhos e perdidos de cada
// mês, com os negócios. Ver lib/utils/historico-negocios.ts.

/** Início do mês atual (meia-noite do dia 1 em Brasília) — corte do quadro de Negócios. */
export function inicioDoMesAtual(agora: Date = new Date()): Date {
  return inicioDoDiaBrasilia(`${diaBrasilia(agora).slice(0, 8)}01`);
}

/** Funis que têm etapa de Ganho ou Perdido (os que entram no histórico). */
export function listFunisComFechamento() {
  return prisma.funil.findMany({
    where: { etapas: { some: { tipo: { in: ["GANHO", "PERDIDO"] } } } },
    orderBy: { ordem: "asc" },
    select: { id: true, nome: true },
  });
}

/** meses = quantos meses pra trás, contando o atual; null = todo o histórico. */
export async function getHistoricoNegocios(params: { funilId: string; meses: number | null; agora?: Date }): Promise<MesHistorico[]> {
  const agora = params.agora ?? new Date();
  const mesAtual = mesDoFechamento(agora);
  let desde: Date | undefined;
  if (params.meses) {
    const [ano, mes] = mesAtual.split("-").map(Number);
    const d = new Date(Date.UTC(ano, mes - params.meses, 1)); // mes-1 (0-based) - (meses-1)
    desde = inicioDoDiaBrasilia(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`);
  }
  const negocios = await prisma.negocio.findMany({
    where: {
      funilId: params.funilId,
      etapa: { tipo: { in: ["GANHO", "PERDIDO"] } },
      ...(desde ? { dataEntradaNaEtapa: { gte: desde } } : {}),
    },
    select: {
      id: true,
      titulo: true,
      valorCentavos: true,
      dataEntradaNaEtapa: true,
      motivoPerda: true,
      etapa: { select: { tipo: true } },
      contato: { select: { nome: true } },
      responsavel: { select: { nome: true } },
    },
  });
  return agruparPorMes(
    negocios.map((n) => ({
      id: n.id,
      titulo: n.titulo,
      contatoNome: n.contato?.nome ?? null,
      responsavelNome: n.responsavel.nome,
      valorCentavos: n.valorCentavos,
      tipo: n.etapa.tipo === "GANHO" ? "GANHO" : "PERDIDO",
      data: n.dataEntradaNaEtapa,
      motivoPerda: n.motivoPerda,
    })),
    mesAtual,
  );
}
