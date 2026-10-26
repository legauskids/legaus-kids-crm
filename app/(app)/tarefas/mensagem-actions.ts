"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { dataHoraDoFormulario } from "@/lib/utils/data-hora";
import {
  agendarMensagemDaTarefa,
  buscarContatosComTelefone,
  cancelarMensagemDaTarefa,
  type ContatoDaMensagem,
} from "@/lib/server/tarefa-mensagem";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// A mensagem aparece na tarefa (Tarefas e aba do negócio) e na conversa do Atendimento.
function revalidar() {
  revalidatePath("/tarefas");
  revalidatePath("/negocios/[negocioId]", "page");
  revalidatePath("/atendimento");
}

/** Agenda uma mensagem de WhatsApp numa tarefa. quando vazio = no prazo da tarefa. */
export async function agendarMensagemTarefaAction(
  tarefaId: string,
  dados: { texto: string; quando: string; contatoId?: string | null },
): Promise<Resultado<{ contatoNome: string; agendadaPara: string }>> {
  const user = await requireUser();
  let quando: Date | null = null;
  if (dados.quando.trim()) {
    try {
      quando = dataHoraDoFormulario(dados.quando);
    } catch {
      return { ok: false, error: "Data/hora da mensagem inválida." };
    }
  }
  const r = await agendarMensagemDaTarefa({ tarefaId, texto: dados.texto, quando, usuarioId: user.id, contatoId: dados.contatoId });
  if (!r.ok) return r;
  revalidar();
  return { ok: true, contatoNome: r.contatoNome, agendadaPara: r.agendadaPara.toISOString() };
}

export async function cancelarMensagemTarefaAction(mensagemId: string): Promise<Resultado> {
  await requireUser();
  const r = await cancelarMensagemDaTarefa(mensagemId);
  if (r.ok) revalidar();
  return r;
}

export async function buscarContatosMensagemAction(termo: string): Promise<ContatoDaMensagem[]> {
  await requireUser();
  return buscarContatosComTelefone(termo);
}
