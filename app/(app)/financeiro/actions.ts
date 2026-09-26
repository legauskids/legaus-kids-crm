"use server";

import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/auth/guards";
import { salvarModeloContrato, gerarContrato, atualizarStatusContrato } from "@/lib/server/contratos";
import {
  importarExtratoOfx,
  conciliarTransacao,
  ignorarTransacao,
  reabrirTransacao,
  classificarEmCentroCusto,
  salvarRateio,
  type LinhaRateio,
} from "@/lib/server/conciliacao-bancaria";
import { criarCentroCusto, atualizarCentroCusto } from "@/lib/server/centros-custo";
import {
  criarEEmitirNotaFiscal,
  atualizarStatusNotaFiscal,
  tentarEmitirNotaFiscal,
  reemitirNotaFiscal,
  type ItemNotaFiscalInput,
} from "@/lib/server/nota-fiscal";
import { criarSimulacao, excluirSimulacao } from "@/lib/server/simulacao-financeira";
import type { StatusContrato, TipoCentroCusto, TipoTransacaoBancaria } from "@prisma/client";

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
  const empresaEmissoraBruta = String(formData.get("empresaEmissora") ?? "LEGAUS");
  const empresaEmissora = empresaEmissoraBruta === "IDEZZA" ? "IDEZZA" : "LEGAUS";
  try {
    await gerarContrato(negocioId, undefined, empresaEmissora);
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
  success?: { totalNoArquivo: number; novasImportadas: number; duplicadasIgnoradas: number; conciliadasAutomaticamente: number };
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

export type AcaoRateioState = { error?: string; success?: boolean };

/** Classifica o lançamento inteiro num centro de custo (atalho do "100%"). */
export async function classificarCentroCustoAction(transacaoId: string, centroCustoId: string): Promise<AcaoRateioState> {
  const user = await requireModulo("financeiro");
  try {
    await classificarEmCentroCusto(transacaoId, centroCustoId, user.id);
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : "Não consegui classificar o lançamento." };
  }
  revalidateFinanceiro();
  return { success: true };
}

/** Divide o lançamento entre projetos e centros de custo (valores parciais). */
export async function salvarRateioAction(transacaoId: string, linhas: LinhaRateio[]): Promise<AcaoRateioState> {
  const user = await requireModulo("financeiro");
  try {
    await salvarRateio(transacaoId, linhas, user.id);
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : "Não consegui salvar a divisão." };
  }
  revalidateFinanceiro();
  return { success: true };
}

export type AcaoCentroCustoState = { error?: string; success?: boolean };

export async function criarCentroCustoAction(nome: string, tipo: TipoCentroCusto, palavrasChave: string[]): Promise<AcaoCentroCustoState> {
  await requireModulo("financeiro");
  try {
    await criarCentroCusto({ nome, tipo, palavrasChave });
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : "Não consegui criar o centro de custo." };
  }
  revalidateFinanceiro();
  return { success: true };
}

export async function atualizarCentroCustoAction(
  id: string,
  dados: { nome?: string; tipo?: TipoCentroCusto; palavrasChave?: string[]; ativo?: boolean },
): Promise<AcaoCentroCustoState> {
  await requireModulo("financeiro");
  try {
    await atualizarCentroCusto(id, dados);
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : "Não consegui salvar o centro de custo." };
  }
  revalidateFinanceiro();
  return { success: true };
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

export type AcaoSimulacaoState = { error?: string; success?: boolean };

export async function criarSimulacaoAction(
  descricao: string,
  valorCentavos: number,
  tipo: TipoTransacaoBancaria,
  data: string | null,
): Promise<AcaoSimulacaoState> {
  const user = await requireModulo("financeiro");
  if (!descricao.trim()) return { error: "Descreva o lançamento." };
  if (valorCentavos <= 0) return { error: "Informe um valor maior que zero." };
  await criarSimulacao({ descricao: descricao.trim(), valorCentavos, tipo, data: data ? new Date(data) : null, criadaPorId: user.id });
  revalidateFinanceiro();
  return { success: true };
}

export async function excluirSimulacaoAction(id: string): Promise<void> {
  await requireModulo("financeiro");
  await excluirSimulacao(id);
  revalidateFinanceiro();
}
