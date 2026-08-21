"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { criarTarefa, moverTarefaStatus } from "@/lib/server/tarefas";

export type CriarTarefaRapidaState = { error?: string; success?: boolean };

export async function criarTarefaRapidaAction(
  negocioId: string,
  _prevState: CriarTarefaRapidaState,
  formData: FormData,
): Promise<CriarTarefaRapidaState> {
  const user = await requireUser();
  const titulo = String(formData.get("titulo") ?? "").trim();
  const responsavelId = String(formData.get("responsavelId") ?? "");
  const prazo = String(formData.get("prazo") ?? "");
  const descricao = String(formData.get("descricao") ?? "").trim();

  if (!titulo || !responsavelId || !prazo) {
    return { error: "Preencha título, responsável e prazo." };
  }

  await criarTarefa({
    titulo,
    negocioId,
    responsavelId,
    solicitanteId: user.id,
    prazo: new Date(prazo),
    descricao: descricao || null,
  });

  revalidatePath(`/negocios/${negocioId}`);
  return { success: true };
}

export async function concluirTarefaRapidaAction(negocioId: string, tarefaId: string): Promise<void> {
  await requireUser();
  await moverTarefaStatus(tarefaId, "CONCLUIDA");
  revalidatePath(`/negocios/${negocioId}`);
}
