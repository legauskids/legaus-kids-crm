"use server";

import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/auth/guards";
import { salvarModeloContrato, gerarContrato, atualizarStatusContrato } from "@/lib/server/contratos";
import {
  importarExtratoOfx,
  conciliarTransacao,
  ignorarTransacao,
  reabrirTransacao,
} from "@/lib/server/conciliacao-bancaria";
import {
  criarEEmitirNotaFiscal,
  atualizarStatusNotaFiscal,
  tentarEmitirNotaFiscal,
  reemitirNotaFiscal,
  type ItemNotaFiscalInput,
} from "@/lib/server/nota-fiscal";
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

export type AcaoImportarExtratoState = {
  error?: string;
  success?: { totalNoArquivo: number; novasImportadas: number; duplicadasIgnoradas: number };
};

export async function importarExtratoAction(
  _prevState: AcaoImportarExtratoState,
  formData: FormData,
): Promise<AcaoImportarExtratoState> {
  const user = await requireModulo("financeiro");
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { error: "Escolha um arquivo OFX." };
  }
  try {
    const bytes = Buffer.from(await arquivo.arrayBuffer());
    const resultado = await importarExtratoOfx({ nomeArquivo: arquivo.name, bytes, importadoPorId: user.id });
    revalidateFinanceiro();
    return { success: resultado };
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : "Não consegui importar esse arquivo." };
  }
}

export async function conciliarTransacaoAction(transacaoId: string, negocioId: string): Promise<void> {
  const user = await requireModulo("financeiro");
  await conciliarTransacao(transacaoId, negocioId, user.id);
  revalidateFinanceiro();
}

export async function ignorarTransacaoAction(transacaoId: string): Promise<void> {
  const user = await requireModulo("financeiro");
  await ignorarTransacao(transacaoId, user.id);
  revalidateFinanceiro();
}

export async function reabrirTransacaoAction(transacaoId: string): Promise<void> {
  await requireModulo("financeiro");
  await reabrirTransacao(transacaoId);
  revalidateFinanceiro();
}

export type AcaoNotaFiscalState = { error?: string; success?: boolean };

export async function criarNotaFiscalAction(
  contatoId: string,
  negocioId: string | undefined,
  orcamentoId: string | undefined,
  itens: ItemNotaFiscalInput[],
): Promise<AcaoNotaFiscalState> {
  const user = await requireModulo("financeiro");
  try {
    await criarEEmitirNotaFiscal({ contatoId, negocioId, orcamentoId, criadaPorId: user.id, itens });
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : "Não consegui criar a nota fiscal." };
  }
  revalidateFinanceiro();
  return { success: true };
}

export async function atualizarStatusNotaFiscalAction(notaFiscalId: string): Promise<AcaoNotaFiscalState> {
  await requireModulo("financeiro");
  try {
    await atualizarStatusNotaFiscal(notaFiscalId);
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : "Não consegui consultar o status." };
  }
  revalidateFinanceiro();
  return { success: true };
}

export async function tentarEmitirNotaFiscalAction(notaFiscalId: string): Promise<AcaoNotaFiscalState> {
  await requireModulo("financeiro");
  try {
    await tentarEmitirNotaFiscal(notaFiscalId);
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : "Não consegui emitir a nota fiscal." };
  }
  revalidateFinanceiro();
  return { success: true };
}

export async function reemitirNotaFiscalAction(notaFiscalIdAnterior: string, itens: ItemNotaFiscalInput[]): Promise<AcaoNotaFiscalState> {
  await requireModulo("financeiro");
  try {
    await reemitirNotaFiscal(notaFiscalIdAnterior, itens);
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : "Não consegui reemitir a nota fiscal." };
  }
  revalidateFinanceiro();
  return { success: true };
}
