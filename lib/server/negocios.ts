import "server-only";
import { prisma } from "@/lib/db";
import { onNegocioEtapaChanged } from "@/lib/server/automations";
import { validarDadosParaContrato } from "@/lib/server/contratos";

export function listFunisComEtapas() {
  return prisma.funil.findMany({
    orderBy: { ordem: "asc" },
    include: { etapas: { orderBy: { ordem: "asc" } } },
  });
}

export function getFunilComEtapas(funilId: string) {
  return prisma.funil.findUnique({
    where: { id: funilId },
    include: { etapas: { orderBy: { ordem: "asc" } } },
  });
}

export function listNegociosPorFunil(funilId: string) {
  return prisma.negocio.findMany({
    where: { funilId },
    include: {
      contato: true,
      responsavel: true,
      etapa: true,
      // Só concluido+etapaId (não o texto) pra montar a barra de progresso
      // do checklist da etapa atual no card do Kanban sem trazer dado à
      // toa — o texto completo só é necessário na tela de detalhe.
      checklistEtapas: { select: { concluido: true, etapaId: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export function getNegocioDetalhado(negocioId: string) {
  return prisma.negocio.findUnique({
    where: { id: negocioId },
    include: {
      contato: true,
      responsavel: true,
      funil: { include: { etapas: { orderBy: { ordem: "asc" } } } },
      etapa: true,
      tarefas: { include: { responsavel: true }, orderBy: { prazo: "asc" } },
      atividades: { include: { autor: true }, orderBy: { criadoEm: "desc" } },
      checklistEtapas: { orderBy: { ordem: "asc" } },
    },
  });
}

export function listNegociosPorContato(contatoId: string) {
  return prisma.negocio.findMany({
    where: { contatoId },
    include: { funil: true, etapa: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function moverNegocio(negocioId: string, novaEtapaId: string): Promise<void> {
  const etapaAlvo = await prisma.etapa.findUniqueOrThrow({ where: { id: novaEtapaId } });
  if (etapaAlvo.tipo === "GANHO") {
    const faltando = await validarDadosParaContrato(negocioId);
    if (faltando.length > 0) {
      throw new Error(`Faltam dados pro contrato antes de marcar como Ganho: ${faltando.join(", ")}.`);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.negocio.update({
      where: { id: negocioId },
      data: { etapaId: novaEtapaId, dataEntradaNaEtapa: new Date() },
    });
    await onNegocioEtapaChanged(tx, negocioId, novaEtapaId);
  });
}

export type CriarNegocioInput = {
  titulo: string;
  produto?: string | null;
  descricao?: string | null;
  contatoId?: string | null;
  funilId: string;
  etapaId: string;
  valorCentavos: number;
  responsavelId: string;
  previsaoFechamento?: Date | null;
  origem?: string | null;
  origemConversaId?: string | null;
};

export async function criarNegocio(input: CriarNegocioInput) {
  const negocio = await prisma.negocio.create({ data: input });
  await prisma.atividade.create({
    data: {
      negocioId: negocio.id,
      tipo: input.origemConversaId ? "WHATSAPP" : "SISTEMA",
      texto: input.origemConversaId
        ? "Negócio criado a partir da conversa no WhatsApp."
        : "Negócio criado.",
    },
  });
  return negocio;
}

export type AtualizarDadosNegocioInput = {
  titulo?: string;
  contatoId?: string | null;
  valorCentavos?: number;
  produto?: string | null;
  descricao?: string | null;
  formaPagamento?: string | null;
  previsaoFechamento?: Date | null;
  origem?: string | null;
  progressoProducao?: number | null;
  previsaoProducao?: Date | null;
  dataInstalacao?: Date | null;
  equipeInstalacao?: string | null;
};

export function atualizarDadosNegocio(negocioId: string, input: AtualizarDadosNegocioInput) {
  return prisma.negocio.update({ where: { id: negocioId }, data: input });
}

export async function marcarNegocioPerdido(negocioId: string, motivo: string): Promise<void> {
  const negocio = await prisma.negocio.findUniqueOrThrow({ where: { id: negocioId } });
  const etapaPerdido = await prisma.etapa.findFirstOrThrow({
    where: { funilId: negocio.funilId, tipo: "PERDIDO" },
  });
  await prisma.$transaction(async (tx) => {
    await tx.negocio.update({
      where: { id: negocioId },
      data: { etapaId: etapaPerdido.id, dataEntradaNaEtapa: new Date(), motivoPerda: motivo },
    });
    await tx.atividade.create({
      data: { negocioId, tipo: "SISTEMA", texto: `Negócio marcado como Perdido. Motivo: ${motivo}` },
    });
  });
}

export function adicionarNotaHistorico(negocioId: string, texto: string, autorId: string) {
  return prisma.atividade.create({
    data: { negocioId, tipo: "NOTA", texto, autorId },
  });
}

// Soft-delete: nunca apaga a linha de verdade, só marca excluidoEm — a
// extensão do Prisma Client em lib/db.ts já filtra esses negócios de toda
// listagem/board/dashboard automaticamente. Justificativa é obrigatória.
export async function excluirNegocio(negocioId: string, motivo: string, excluidoPorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.negocio.update({
      where: { id: negocioId },
      data: { excluidoEm: new Date(), motivoExclusao: motivo, excluidoPorId },
    });
    await tx.atividade.create({
      data: { negocioId, tipo: "SISTEMA", texto: `Negócio excluído. Motivo: ${motivo}`, autorId: excluidoPorId },
    });
  });
}

/**
 * Checklist avulso da etapa ATUAL de um negócio (não é um modelo padrão
 * reaproveitado entre negócios — cada item é digitado na hora). Preso à
 * etapa em que foi criado: se o negócio mudar de etapa, esses itens somem
 * da tela (a UI só mostra os da etapa atual) mas continuam no banco,
 * então o progresso de uma etapa já percorrida não se perde.
 */
export async function adicionarItemChecklistNegocio(negocioId: string, etapaId: string, texto: string) {
  const ultimo = await prisma.itemChecklistNegocio.findFirst({ where: { negocioId, etapaId }, orderBy: { ordem: "desc" } });
  return prisma.itemChecklistNegocio.create({
    data: { negocioId, etapaId, texto, ordem: (ultimo?.ordem ?? -1) + 1 },
  });
}

export async function alternarItemChecklistNegocio(itemId: string) {
  const item = await prisma.itemChecklistNegocio.findUniqueOrThrow({ where: { id: itemId } });
  return prisma.itemChecklistNegocio.update({ where: { id: itemId }, data: { concluido: !item.concluido } });
}

export function excluirItemChecklistNegocio(itemId: string) {
  return prisma.itemChecklistNegocio.delete({ where: { id: itemId } });
}
