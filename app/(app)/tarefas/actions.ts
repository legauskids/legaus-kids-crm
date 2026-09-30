"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import {
  criarTarefa,
  moverTarefaStatus,
  aprovarTarefa,
  atualizarTarefa,
  atualizarPrazoTarefa,
  adicionarItemChecklist,
  alternarItemChecklist,
  excluirItemChecklist,
} from "@/lib/server/tarefas";
import { criarTarefaSchema } from "@/lib/validators/tarefa";
import { dataHoraDoFormulario } from "@/lib/utils/data-hora";
import { itensDoChecklist } from "@/lib/utils/checklist";
import { categoriaDoFormulario } from "@/lib/utils/categoria-tarefa";

// Tarefas e o Painel (card de Compromissos conta as tarefas concluídas e planejadas).
function revalidarTarefas() {
  revalidatePath("/tarefas");
  revalidatePath("/");
}

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
  const checklist = itensDoChecklist(formData);

  let prazo: Date;
  try {
    prazo = dataHoraDoFormulario(parsed.data.prazo);
  } catch {
    return { error: "Prazo inválido." };
  }

  await criarTarefa({
    titulo: parsed.data.titulo,
    negocioId: parsed.data.negocioId || null,
    responsavelId: parsed.data.responsavelId,
    solicitanteId: user.id,
    prazo,
    status: parsed.data.status,
    descricao: parsed.data.descricao || null,
    checklist,
    ...categoriaDoFormulario(formData),
  });

  revalidarTarefas();
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

  let prazo: Date;
  try {
    prazo = dataHoraDoFormulario(parsed.data.prazo);
  } catch {
    return { error: "Prazo inválido." };
  }

  await atualizarTarefa(tarefaId, {
    titulo: parsed.data.titulo,
    negocioId: parsed.data.negocioId || null,
    responsavelId: parsed.data.responsavelId,
    prazo,
    status: parsed.data.status,
    descricao: parsed.data.descricao || null,
    ...categoriaDoFormulario(formData),
  });

  revalidarTarefas();
  return { success: true };
}

export async function atualizarPrazoTarefaAction(tarefaId: string, prazo: string): Promise<void> {
  await requireUser();
  await atualizarPrazoTarefa(tarefaId, dataHoraDoFormulario(prazo));
  revalidarTarefas();
}

export async function moverTarefaAction(
  tarefaId: string,
  novoStatus: "A_FAZER" | "EM_ANDAMENTO" | "APROVACAO" | "CONCLUIDA",
): Promise<void> {
  await requireUser();
  await moverTarefaStatus(tarefaId, novoStatus);
  revalidarTarefas();
}

export async function aprovarTarefaAction(tarefaId: string): Promise<void> {
  await requireUser();
  await aprovarTarefa(tarefaId);
  revalidarTarefas();
}

export async function adicionarItemChecklistAction(tarefaId: string, texto: string): Promise<void> {
  await requireUser();
  const limpo = texto.trim();
  if (!limpo) return;
  await adicionarItemChecklist(tarefaId, limpo);
  revalidarTarefas();
}

export async function alternarItemChecklistAction(itemId: string): Promise<void> {
  await requireUser();
  await alternarItemChecklist(itemId);
  revalidarTarefas();
}

export async function excluirItemChecklistAction(itemId: string): Promise<void> {
  await requireUser();
  await excluirItemChecklist(itemId);
  revalidarTarefas();
}
