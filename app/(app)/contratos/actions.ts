"use server";

import { revalidatePath } from "next/cache";
import { requireAlgumModulo } from "@/lib/auth/guards";
import {
  atualizarDadosDoContrato,
  atualizarStatusContrato,
  criarContratoComFormulario,
  dadosIniciaisContrato,
  finalizarContrato,
  reabrirContrato,
  salvarTextoDoContrato,
} from "@/lib/server/contratos";
import type { ChaveEmpresaEmissora } from "@/lib/constants/empresa";
import type { StatusContrato } from "@prisma/client";

// A tela do contrato abre pra quem tem Negócios (a Dani, que recebe a tarefa
// "Emissão de contrato") ou Financeiro (aba Contratos).
const exigirAcesso = () => requireAlgumModulo("negocios", "financeiro");

function atualizarTelas(contratoId?: string) {
  revalidatePath("/financeiro");
  if (contratoId) revalidatePath(`/contratos/${contratoId}`);
}

/** Formulário já preenchido pro diálogo do Ganho. */
export async function dadosIniciaisContratoAction(negocioId: string, empresaEmissora: ChaveEmpresaEmissora) {
  await exigirAcesso();
  try {
    return await dadosIniciaisContrato(negocioId, empresaEmissora === "IDEZZA" ? "IDEZZA" : "LEGAUS");
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : "Não consegui carregar os dados do negócio." };
  }
}

export async function criarContratoAction(negocioId: string, dados: unknown) {
  await exigirAcesso();
  const resultado = await criarContratoComFormulario(negocioId, dados);
  if ("contratoId" in resultado) atualizarTelas();
  return resultado;
}

export async function atualizarDadosContratoAction(contratoId: string, dados: unknown) {
  await exigirAcesso();
  const resultado = await atualizarDadosDoContrato(contratoId, dados);
  if ("conteudo" in resultado) atualizarTelas(contratoId);
  return resultado;
}

/** Texto editado à mão — salva sozinho enquanto digita, sem recarregar a tela. */
export async function salvarTextoContratoAction(contratoId: string, conteudo: string) {
  await exigirAcesso();
  return salvarTextoDoContrato(contratoId, String(conteudo ?? ""));
}

export async function finalizarContratoAction(contratoId: string) {
  await exigirAcesso();
  const resultado = await finalizarContrato(contratoId);
  atualizarTelas(contratoId);
  return resultado;
}

export async function reabrirContratoAction(contratoId: string) {
  await exigirAcesso();
  const resultado = await reabrirContrato(contratoId);
  atualizarTelas(contratoId);
  return resultado;
}

const STATUS_FINALIZADOS: StatusContrato[] = ["GERADO", "ENVIADO", "ASSINADO", "CANCELADO"];

/** Enviado / Assinado / Cancelado depois de finalizado (voltar pra rascunho é pelo Reabrir). */
export async function mudarStatusContratoAction(contratoId: string, status: StatusContrato): Promise<{ ok: true } | { error: string }> {
  await exigirAcesso();
  if (!STATUS_FINALIZADOS.includes(status)) return { error: "Situação inválida." };
  await atualizarStatusContrato(contratoId, status);
  atualizarTelas(contratoId);
  return { ok: true };
}
