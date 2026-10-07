"use server";

import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/auth/guards";
import { salvarModeloContrato, gerarContrato, atualizarStatusContrato } from "@/lib/server/contratos";
import {
  importarExtratoOfx,
  confirmarPar,
  rejeitarPar,
  classificarSaida,
  classificarEntrada,
  ignorarTransacao,
  reabrirTransacao,
  salvarRateio,
  type LinhaRateio,
} from "@/lib/server/conciliacao-bancaria";
import { criarCentroCusto, atualizarCentroCusto, criarCentroGeral, atualizarCentroGeral } from "@/lib/server/centros-custo";
import { criarDespesa, atualizarDespesa, confirmarDespesa, excluirDespesa, type DadosDespesa } from "@/lib/server/despesas";
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

/** Mensagem legível pro toast — violação de unique vira frase, o resto passa direto. */
function mensagemDeErro(erro: unknown, padrao: string, seRepetido = "Já existe um cadastro com esse nome."): string {
  if (typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002") return seRepetido;
  return erro instanceof Error ? erro.message : padrao;
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
  success?: { totalNoArquivo: number; novasImportadas: number; duplicadasIgnoradas: number; paresProvaveis: number; entradasComSugestao: number };
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

export type AcaoConciliacaoState = { error?: string; success?: boolean };

async function acaoConciliacao(executar: (usuarioId: string) => Promise<unknown>, padrao: string): Promise<AcaoConciliacaoState> {
  const user = await requireModulo("financeiro");
  try {
    await executar(user.id);
  } catch (erro) {
    return { error: mensagemDeErro(erro, padrao, "Esse lançamento já tem uma despesa vinculada — atualize a tela.") };
  }
  revalidateFinanceiro();
  return { success: true };
}

/** "Confirmar par": vincula a despesa já registrada à saída do extrato. */
export async function confirmarParAction(transacaoId: string, despesaId: string): Promise<AcaoConciliacaoState> {
  return acaoConciliacao((usuarioId) => confirmarPar(transacaoId, despesaId, usuarioId), "Não consegui confirmar o par.");
}

/** "Não é esse": descarta a despesa como par dessa linha. */
export async function rejeitarParAction(transacaoId: string, despesaId: string): Promise<AcaoConciliacaoState> {
  return acaoConciliacao((usuarioId) => rejeitarPar(transacaoId, despesaId, usuarioId), "Não consegui descartar o par.");
}

export async function classificarSaidaAction(
  transacaoId: string,
  dados: { fornecedor: string; categoriaId: string | null; centroGeralId: string | null; negocioId: string | null },
): Promise<AcaoConciliacaoState> {
  return acaoConciliacao((usuarioId) => classificarSaida(transacaoId, dados, usuarioId), "Não consegui classificar o lançamento.");
}

export async function classificarEntradaAction(
  transacaoId: string,
  destino: { negocioId: string | null; centroGeralId: string | null },
): Promise<AcaoConciliacaoState> {
  return acaoConciliacao((usuarioId) => classificarEntrada(transacaoId, destino, usuarioId), "Não consegui vincular a entrada.");
}

export async function ignorarTransacaoAction(transacaoId: string): Promise<AcaoConciliacaoState> {
  return acaoConciliacao((usuarioId) => ignorarTransacao(transacaoId, usuarioId), "Não consegui ignorar o lançamento.");
}

/** "Desfazer": a linha volta a pendente e a despesa vinculada volta a aguardar. */
export async function reabrirTransacaoAction(transacaoId: string): Promise<AcaoConciliacaoState> {
  return acaoConciliacao(() => reabrirTransacao(transacaoId), "Não consegui desfazer.");
}

export type AcaoRateioState = { error?: string; success?: boolean };

/** Divide o lançamento entre projetos e categorias (valores parciais). */
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

export async function criarCentroCustoAction(
  nome: string,
  tipo: TipoCentroCusto,
  palavrasChave: string[],
  centroGeralPadraoId: string | null = null,
): Promise<AcaoCentroCustoState> {
  await requireModulo("financeiro");
  try {
    await criarCentroCusto({ nome, tipo, palavrasChave, centroGeralPadraoId });
  } catch (erro) {
    return { error: mensagemDeErro(erro, "Não consegui criar a categoria.") };
  }
  revalidateFinanceiro();
  return { success: true };
}

export async function atualizarCentroCustoAction(
  id: string,
  dados: { nome?: string; tipo?: TipoCentroCusto; palavrasChave?: string[]; ativo?: boolean; centroGeralPadraoId?: string | null },
): Promise<AcaoCentroCustoState> {
  await requireModulo("financeiro");
  try {
    await atualizarCentroCusto(id, dados);
  } catch (erro) {
    return { error: mensagemDeErro(erro, "Não consegui salvar a categoria.") };
  }
  revalidateFinanceiro();
  return { success: true };
}

export async function criarCentroGeralAction(nome: string): Promise<AcaoCentroCustoState> {
  await requireModulo("financeiro");
  try {
    await criarCentroGeral(nome);
  } catch (erro) {
    return { error: mensagemDeErro(erro, "Não consegui criar o centro de custo.") };
  }
  revalidateFinanceiro();
  return { success: true };
}

export async function atualizarCentroGeralAction(id: string, dados: { nome?: string; ativo?: boolean }): Promise<AcaoCentroCustoState> {
  await requireModulo("financeiro");
  try {
    await atualizarCentroGeral(id, dados);
  } catch (erro) {
    return { error: mensagemDeErro(erro, "Não consegui salvar o centro de custo.") };
  }
  revalidateFinanceiro();
  return { success: true };
}

export type AcaoDespesaState = { error?: string; success?: boolean };

/** Lançamento manual pela tela — já entra aguardando conciliação. */
export async function criarDespesaAction(dados: DadosDespesa): Promise<AcaoDespesaState> {
  const user = await requireModulo("financeiro");
  try {
    await criarDespesa({ ...dados, origem: "MANUAL", registradaPorId: user.id });
  } catch (erro) {
    return { error: mensagemDeErro(erro, "Não consegui registrar a despesa.") };
  }
  revalidateFinanceiro();
  return { success: true };
}

export async function atualizarDespesaAction(id: string, dados: DadosDespesa): Promise<AcaoDespesaState> {
  await requireModulo("financeiro");
  try {
    await atualizarDespesa(id, dados);
  } catch (erro) {
    return { error: mensagemDeErro(erro, "Não consegui salvar a despesa.") };
  }
  revalidateFinanceiro();
  return { success: true };
}

export async function confirmarDespesaAction(id: string): Promise<AcaoDespesaState> {
  await requireModulo("financeiro");
  try {
    await confirmarDespesa(id);
  } catch (erro) {
    return { error: mensagemDeErro(erro, "Não consegui confirmar a despesa.") };
  }
  revalidateFinanceiro();
  return { success: true };
}

export async function excluirDespesaAction(id: string): Promise<AcaoDespesaState> {
  await requireModulo("financeiro");
  try {
    await excluirDespesa(id);
  } catch (erro) {
    return { error: mensagemDeErro(erro, "Não consegui excluir a despesa.") };
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
