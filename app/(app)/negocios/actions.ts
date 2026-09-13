"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import {
  moverNegocio,
  criarNegocio,
  marcarNegocioPerdido,
  atualizarDadosNegocio,
  adicionarNotaHistorico,
  excluirNegocio,
} from "@/lib/server/negocios";
import { marcarPagamentoIdentificado } from "@/lib/server/automations";
import {
  criarNegocioSchema,
  marcarPerdidoSchema,
  atualizarDadosNegocioSchema,
  excluirNegocioSchema,
} from "@/lib/validators/negocio";
import { reaisParaCentavos } from "@/lib/utils/money";

export async function moverNegocioAction(negocioId: string, novaEtapaId: string): Promise<{ error?: string }> {
  await requireUser();
  try {
    await moverNegocio(negocioId, novaEtapaId);
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : "Não consegui mover o negócio." };
  }
  revalidatePath("/negocios");
  revalidatePath(`/negocios/${negocioId}`);
  return {};
}

export type CriarNegocioState = { error?: string; success?: boolean };

export async function criarNegocioAction(
  _prevState: CriarNegocioState,
  formData: FormData,
): Promise<CriarNegocioState> {
  await requireUser();
  const raw = Object.fromEntries(formData);
  if (raw.contatoId === "__nenhum__") delete raw.contatoId;
  const parsed = criarNegocioSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await criarNegocio({
    titulo: parsed.data.titulo,
    contatoId: parsed.data.contatoId || null,
    funilId: parsed.data.funilId,
    etapaId: parsed.data.etapaId,
    valorCentavos: reaisParaCentavos(parsed.data.valorReais),
    responsavelId: parsed.data.responsavelId,
    previsaoFechamento: parsed.data.previsaoFechamento ? new Date(parsed.data.previsaoFechamento) : null,
    origem: parsed.data.origem || null,
  });

  revalidatePath("/negocios");
  return { success: true };
}

export async function marcarPerdidoAction(negocioId: string, motivo: string): Promise<void> {
  await requireUser();
  const parsed = marcarPerdidoSchema.safeParse({ negocioId, motivo });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  await marcarNegocioPerdido(parsed.data.negocioId, parsed.data.motivo);
  revalidatePath("/negocios");
  revalidatePath(`/negocios/${negocioId}`);
}

export async function marcarPagamentoIdentificadoAction(negocioId: string): Promise<void> {
  await requireUser();
  await marcarPagamentoIdentificado(negocioId);
  revalidatePath("/negocios");
  revalidatePath(`/negocios/${negocioId}`);
}

export type AtualizarDadosState = { error?: string; success?: boolean };

export async function atualizarDadosNegocioAction(
  _prevState: AtualizarDadosState,
  formData: FormData,
): Promise<AtualizarDadosState> {
  await requireUser();
  const raw = Object.fromEntries(formData);
  if (raw.contatoId === "__nenhum__") raw.contatoId = "";
  if (raw.origem === "__nenhuma__") raw.origem = "";
  const parsed = atualizarDadosNegocioSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await atualizarDadosNegocio(parsed.data.negocioId, {
    titulo: parsed.data.titulo || undefined,
    contatoId: parsed.data.contatoId === "" ? null : parsed.data.contatoId,
    valorCentavos: parsed.data.valorReais != null ? reaisParaCentavos(parsed.data.valorReais) : undefined,
    produto: parsed.data.produto || undefined,
    descricao: parsed.data.descricao || undefined,
    formaPagamento: parsed.data.formaPagamento || undefined,
    previsaoFechamento: parsed.data.previsaoFechamento ? new Date(parsed.data.previsaoFechamento) : undefined,
    origem: parsed.data.origem || undefined,
    progressoProducao: parsed.data.progressoProducao,
    previsaoProducao: parsed.data.previsaoProducao ? new Date(parsed.data.previsaoProducao) : undefined,
    dataInstalacao: parsed.data.dataInstalacao ? new Date(parsed.data.dataInstalacao) : undefined,
    equipeInstalacao: parsed.data.equipeInstalacao || undefined,
  });

  revalidatePath("/negocios");
  revalidatePath(`/negocios/${parsed.data.negocioId}`);
  return { success: true };
}

export async function adicionarNotaHistoricoAction(negocioId: string, texto: string): Promise<void> {
  const user = await requireUser();
  if (!texto.trim()) return;
  await adicionarNotaHistorico(negocioId, texto.trim(), user.id);
  revalidatePath(`/negocios/${negocioId}`);
}

export async function excluirNegocioAction(negocioId: string, motivo: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const parsed = excluirNegocioSchema.safeParse({ negocioId, motivo });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  await excluirNegocio(parsed.data.negocioId, parsed.data.motivo, user.id);
  revalidatePath("/negocios");
  revalidatePath(`/negocios/${negocioId}`);
  return {};
}
