import "server-only";
import { prisma } from "@/lib/db";
import { onTarefaConcluida } from "@/lib/server/automations";

export function listTarefasPorNegocio(negocioId: string) {
  return prisma.tarefa.findMany({
    where: { negocioId },
    include: { responsavel: true, solicitante: true },
    orderBy: { prazo: "asc" },
  });
}

export function listTarefas() {
  return prisma.tarefa.findMany({
    include: {
      responsavel: true,
      solicitante: true,
      negocio: { include: { etapa: true, funil: true } },
      contato: true,
      checklist: { orderBy: { ordem: "asc" } },
      reuniao: { select: { id: true, titulo: true } },
    },
    orderBy: { prazo: "asc" },
  });
}

export type CriarTarefaInput = {
  titulo: string;
  negocioId?: string | null;
  contatoId?: string | null;
  conversaId?: string | null;
  responsavelId: string;
  solicitanteId: string;
  prazo: Date;
  descricao?: string | null;
  status?: "A_FAZER" | "EM_ANDAMENTO" | "APROVACAO" | "CONCLUIDA";
  /** Compromisso firmado numa reunião (painel /reunioes). */
  reuniaoId?: string | null;
};

export function criarTarefa(input: CriarTarefaInput) {
  return prisma.tarefa.create({ data: input });
}

export type AtualizarTarefaInput = {
  titulo: string;
  negocioId?: string | null;
  responsavelId: string;
  prazo: Date;
  descricao?: string | null;
  status: "A_FAZER" | "EM_ANDAMENTO" | "APROVACAO" | "CONCLUIDA";
};

export async function atualizarPrazoTarefa(tarefaId: string, prazo: Date): Promise<void> {
  await prisma.tarefa.update({ where: { id: tarefaId }, data: { prazo } });
}

export async function atualizarTarefa(tarefaId: string, input: AtualizarTarefaInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const anterior = await tx.tarefa.findUniqueOrThrow({ where: { id: tarefaId } });
    await tx.tarefa.update({ where: { id: tarefaId }, data: input });
    if (input.status === "CONCLUIDA" && anterior.status !== "CONCLUIDA") {
      await onTarefaConcluida(tx, tarefaId);
    }
  });
}

export async function moverTarefaStatus(
  tarefaId: string,
  novoStatus: "A_FAZER" | "EM_ANDAMENTO" | "APROVACAO" | "CONCLUIDA",
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.tarefa.update({ where: { id: tarefaId }, data: { status: novoStatus } });
    if (novoStatus === "CONCLUIDA") {
      await onTarefaConcluida(tx, tarefaId);
    }
  });
}

export async function aprovarTarefa(tarefaId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const tarefa = await tx.tarefa.update({
      where: { id: tarefaId },
      data: { status: "CONCLUIDA" },
    });
    await tx.lembrete.create({
      data: {
        paraUsuarioId: tarefa.solicitanteId,
        nome: `Sua tarefa "${tarefa.titulo}" foi aprovada.`,
        tarefaId: tarefa.id,
      },
    });
    await onTarefaConcluida(tx, tarefaId);
  });
}

export async function adicionarItemChecklist(tarefaId: string, texto: string) {
  const ultimo = await prisma.itemChecklistTarefa.findFirst({ where: { tarefaId }, orderBy: { ordem: "desc" } });
  return prisma.itemChecklistTarefa.create({
    data: { tarefaId, texto, ordem: (ultimo?.ordem ?? -1) + 1 },
  });
}

export async function alternarItemChecklist(itemId: string) {
  const item = await prisma.itemChecklistTarefa.findUniqueOrThrow({ where: { id: itemId } });
  return prisma.itemChecklistTarefa.update({ where: { id: itemId }, data: { concluido: !item.concluido } });
}

export function excluirItemChecklist(itemId: string) {
  return prisma.itemChecklistTarefa.delete({ where: { id: itemId } });
}
