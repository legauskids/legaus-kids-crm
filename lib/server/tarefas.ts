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
