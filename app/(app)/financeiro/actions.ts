"use server";

import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/auth/guards";
import { salvarModeloContrato, gerarContrato, atualizarStatusContrato } from "@/lib/server/contratos";
import type { StatusContrato } from "@prisma/client";

function revalidateFinanceiro() {
  revalidatePath("/financeiro");
}

export type AcaoContratoState = { error?: string; success?: boolean };

export async function salvarModeloContratoAction(
  _prevState: AcaoContratoState,
  formData: FormData,
): Promise<AcaoContratoState> {
  await requireModulo("financeiro");
  const conteudo = String(formData.get("conteudo") ?? "").trim();
  if (!conteudo) return { error: "O modelo não pode ficar vazio." };
  await salvarModeloContrato(conteudo);
  revalidateFinanceiro();
  return { success: true };
}

export async function gerarContratoManualAction(
  _prevState: AcaoContratoState,
  formData: FormData,
): Promise<AcaoContratoState> {
  await requireModulo("financeiro");
  const negocioId = String(formData.get("negocioId") ?? "");
  if (!negocioId) return { error: "Escolha um negócio." };
  try {
    await gerarContrato(negocioId);
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : "Não consegui gerar o contrato." };
  }
  revalidateFinanceiro();
  return { success: true };
}

export async function atualizarStatusContratoAction(contratoId: string, status: StatusContrato): Promise<void> {
  await requireModulo("financeiro");
  await atualizarStatusContrato(contratoId, status);
  revalidateFinanceiro();
}
