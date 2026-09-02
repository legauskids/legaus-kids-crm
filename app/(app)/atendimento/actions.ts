"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import {
  registrarMensagem,
  assumirConversa,
  transferirConversa,
  criarNotaInterna,
  criarMensagemAgendada,
  cancelarMensagemAgendada,
} from "@/lib/server/conversas";
import { criarRespostaRapida, excluirRespostaRapida } from "@/lib/server/respostas-rapidas";
import { salvarContatoPorTelefone, existeContatoComTelefone } from "@/lib/server/contatos";
import { criarNegocio, moverNegocio } from "@/lib/server/negocios";
import { criarTarefa } from "@/lib/server/tarefas";
import { gerarSugestaoResposta } from "@/lib/server/agente-atendimento";
import {
  enviarMensagemSchema,
  criarNotaSchema,
  criarAgendadaSchema,
  transferirSchema,
  negocioMiniFormSchema,
  tarefaMiniFormSchema,
  moverMiniFormSchema,
} from "@/lib/validators/conversa";
import { reaisParaCentavos } from "@/lib/utils/money";

function revalidateAtendimento() {
  revalidatePath("/atendimento");
}

export async function enviarMensagemAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = enviarMensagemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await registrarMensagem({
    conversaId: parsed.data.conversaId,
    texto: parsed.data.texto,
    direcao: "SAIDA",
    origem: "MANUAL",
    autorUserId: user.id,
  });
  revalidateAtendimento();
}

export type SugestaoAgenteState = { sugestao?: string; error?: string };

export async function gerarSugestaoAgenteAction(conversaId: string): Promise<SugestaoAgenteState> {
  await requireUser();
  try {
    const sugestao = await gerarSugestaoResposta(conversaId);
    return { sugestao };
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : "Não consegui gerar uma sugestão." };
  }
}

export async function assumirConversaAction(conversaId: string): Promise<void> {
  const user = await requireUser();
  await assumirConversa(conversaId, user.id);
  revalidateAtendimento();
}

export async function transferirConversaAction(formData: FormData): Promise<void> {
  await requireUser();
  const raw = Object.fromEntries(formData);
  if (raw.atendenteId === "__fila__") raw.atendenteId = "";
  const parsed = transferirSchema.safeParse(raw);
  if (!parsed.success) return;
  await transferirConversa(parsed.data.conversaId, {
    setorId: parsed.data.setorId || undefined,
    atendenteId: parsed.data.atendenteId === "" ? null : parsed.data.atendenteId,
  });
  revalidateAtendimento();
}

export async function criarNotaAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = criarNotaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await criarNotaInterna(parsed.data.conversaId, user.id, parsed.data.texto);
  revalidateAtendimento();
}

export type CriarAgendadaState = { error?: string; success?: boolean };

export async function criarAgendadaAction(
  _prevState: CriarAgendadaState,
  formData: FormData,
): Promise<CriarAgendadaState> {
  const user = await requireUser();
  const parsed = criarAgendadaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  await criarMensagemAgendada({
    conversaId: parsed.data.conversaId,
    texto: parsed.data.texto,
    agendadaPara: new Date(parsed.data.agendadaPara),
    criadaPorId: user.id,
  });
  revalidateAtendimento();
  return { success: true };
}

export async function cancelarAgendadaAction(id: string): Promise<void> {
  await requireUser();
  await cancelarMensagemAgendada(id);
  revalidateAtendimento();
}

export async function criarRespostaRapidaAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const titulo = String(formData.get("titulo") ?? "").trim();
  const texto = String(formData.get("texto") ?? "").trim();
  const escopo = formData.get("escopo") === "PESSOAL" ? "PESSOAL" : "COMPARTILHADA";
  if (!titulo || !texto) return;
  await criarRespostaRapida({ titulo, texto, escopo, donoId: escopo === "PESSOAL" ? user.id : undefined });
  revalidateAtendimento();
}

export async function excluirRespostaRapidaAction(id: string): Promise<void> {
  await requireUser();
  await excluirRespostaRapida(id);
  revalidateAtendimento();
}

export type NegocioMiniFormState = { error?: string; negocioId?: string };

export async function criarNegocioMiniFormAction(
  _prevState: NegocioMiniFormState,
  formData: FormData,
): Promise<NegocioMiniFormState> {
  const user = await requireUser();
  const parsed = negocioMiniFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (parsed.data.criarTarefa && (!parsed.data.tarefaTitulo || !parsed.data.tarefaPrazo)) {
    return { error: "Preencha o título e o prazo da tarefa." };
  }

  const negocio = await criarNegocio({
    titulo: parsed.data.titulo,
    produto: parsed.data.produto || null,
    descricao: parsed.data.descricao || null,
    contatoId: parsed.data.contatoId,
    funilId: parsed.data.funilId,
    etapaId: parsed.data.etapaId,
    valorCentavos: reaisParaCentavos(parsed.data.valorReais),
    responsavelId: parsed.data.responsavelId,
    previsaoFechamento: parsed.data.previsaoFechamento ? new Date(parsed.data.previsaoFechamento) : null,
    origem: parsed.data.origem || null,
    origemConversaId: parsed.data.conversaId,
  });

  if (parsed.data.criarTarefa && parsed.data.tarefaTitulo && parsed.data.tarefaPrazo) {
    await criarTarefa({
      titulo: parsed.data.tarefaTitulo,
      negocioId: negocio.id,
      contatoId: parsed.data.contatoId,
      conversaId: parsed.data.conversaId,
      responsavelId: parsed.data.tarefaResponsavelId || parsed.data.responsavelId,
      solicitanteId: user.id,
      prazo: new Date(parsed.data.tarefaPrazo),
      descricao: parsed.data.tarefaDescricao || null,
    });
  }

  revalidateAtendimento();
  revalidatePath("/negocios");
  return { negocioId: negocio.id };
}

export type TarefaMiniFormState = { error?: string; success?: boolean };

export async function criarTarefaMiniFormAction(
  _prevState: TarefaMiniFormState,
  formData: FormData,
): Promise<TarefaMiniFormState> {
  const user = await requireUser();
  const parsed = tarefaMiniFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  await criarTarefa({
    titulo: parsed.data.titulo,
    contatoId: parsed.data.contatoId,
    conversaId: parsed.data.conversaId,
    responsavelId: parsed.data.responsavelId,
    solicitanteId: user.id,
    prazo: new Date(parsed.data.prazo),
    descricao: parsed.data.descricao || null,
  });
  revalidateAtendimento();
  return { success: true };
}

export type MoverMiniFormState = { error?: string; success?: boolean };

export async function moverMiniFormAction(
  _prevState: MoverMiniFormState,
  formData: FormData,
): Promise<MoverMiniFormState> {
  await requireUser();
  const parsed = moverMiniFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  await moverNegocio(parsed.data.negocioId, parsed.data.etapaId);
  revalidateAtendimento();
  return { success: true };
}

export async function adicionarContatoCompartilhadoAction(
  nome: string,
  telefone: string,
): Promise<{ id: string; jaExistia: boolean } | { error: string }> {
  await requireUser();
  try {
    // Por telefone (não criarContato) de propósito: um contato compartilhado
    // pode já existir no CRM com esse número (ex: já é cliente) — nesse caso
    // só reaproveita o registro em vez de estourar erro de telefone
    // duplicado.
    const jaExistia = await existeContatoComTelefone(telefone);
    const contato = await salvarContatoPorTelefone({ nome, telefone });
    return { id: contato.id, jaExistia };
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : "Não consegui adicionar o contato." };
  }
}
