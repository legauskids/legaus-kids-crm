"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { criarTarefa, moverTarefaStatus, aprovarTarefa, atualizarTarefa, atualizarPrazoTarefa } from "@/lib/server/tarefas";
import { criarTarefaSchema } from "@/lib/validators/tarefa";

export type CriarTarefaState = { error?: string; success?: boolean };

export async function criarTarefaAction(
  _prevState: CriarTarefaState,
  formData: FormData,
): Promise<CriarTarefaState> {
  const user = await requireUser();
  const raw = Object.fromEntries(formData);
  if (raw.negocioId === "__nenhum__") delete raw.negocioId;
  const parsed = criarTarefaSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await criarTarefa({
    titulo: parsed.data.titulo,
    negocioId: parsed.data.negocioId || null,
    responsavelId: parsed.data.responsavelId,
    solicitanteId: user.id,
    prazo: new Date(parsed.data.prazo),
    status: parsed.data.status,
    descricao: parsed.data.descricao || null,
  });

  revalidatePath("/tarefas");
  return { success: true };
}

export type AtualizarTarefaState = { error?: string; success?: boolean };

export async function atualizarTarefaAction(
  tarefaId: string,
  _prevState: AtualizarTarefaState,
  formData: FormData,
): Promise<AtualizarTarefaState> {
  await requireUser();
  const raw = Object.fromEntries(formData);
  if (raw.negocioId === "__nenhum__") delete raw.negocioId;
  const parsed = criarTarefaSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await atualizarTarefa(tarefaId, {
    titulo: parsed.data.titulo,
    negocioId: parsed.data.negocioId || null,
    responsavelId: parsed.data.responsavelId,
    prazo: new Date(parsed.data.prazo),
    status: parsed.data.status,
    descricao: parsed.data.descricao || null,
  });

  revalidatePath("/tarefas");
  return { success: true };
}

export async function atualizarPrazoTarefaAction(tarefaId: string, prazo: string): Promise<void> {
  await requireUser();
  await atualizarPrazoTarefa(tarefaId, new Date(prazo));
  revalidatePath("/tarefas");
}

export async function moverTarefaAction(
  tarefaId: string,
  novoStatus: "A_FAZER" | "EM_ANDAMENTO" | "APROVACAO" | "CONCLUIDA",
): Promise<void> {
  await requireUser();
  await moverTarefaStatus(tarefaId, novoStatus);
  revalidatePath("/tarefas");
}

export async function aprovarTarefaAction(tarefaId: string): Promise<void> {
  await requireUser();
  await aprovarTarefa(tarefaId);
  revalidatePath("/tarefas");
}
