"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { criarTarefa, moverTarefaStatus } from "@/lib/server/tarefas";
import { dataHoraDoFormulario } from "@/lib/utils/data-hora";
import { itensDoChecklist } from "@/lib/utils/checklist";
import { categoriaDoFormulario } from "@/lib/utils/categoria-tarefa";
import { mensagemDoFormulario } from "@/lib/utils/mensagem-tarefa";
import { agendarMensagemDaTarefa, conferirMensagemDeNovaTarefa } from "@/lib/server/tarefa-mensagem";

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

  const prazoData = dataHoraDoFormulario(prazo);
  // "Agendar mensagem no WhatsApp" (pro contato do negócio): confere antes de criar a tarefa.
  const mensagem = mensagemDoFormulario(formData);
  if (mensagem && "erro" in mensagem) return { error: mensagem.erro };
  if (mensagem) {
    const problema = await conferirMensagemDeNovaTarefa({ ...mensagem, prazo: prazoData, negocioId });
    if (problema) return { error: problema };
  }

  const tarefa = await criarTarefa({
    titulo,
    negocioId,
    responsavelId,
    solicitanteId: user.id,
    prazo: prazoData,
    descricao: descricao || null,
    checklist: itensDoChecklist(formData),
    ...categoriaDoFormulario(formData),
  });

  revalidatePath(`/negocios/${negocioId}`);
  if (mensagem) {
    const r = await agendarMensagemDaTarefa({ tarefaId: tarefa.id, texto: mensagem.texto, quando: mensagem.quando, usuarioId: user.id });
    revalidatePath("/atendimento");
    if (!r.ok) return { error: `A tarefa foi criada, mas a mensagem não foi agendada: ${r.error}` };
  }
  return { success: true };
}

export async function concluirTarefaRapidaAction(negocioId: string, tarefaId: string): Promise<void> {
  await requireUser();
  await moverTarefaStatus(tarefaId, "CONCLUIDA");
  revalidatePath(`/negocios/${negocioId}`);
}
