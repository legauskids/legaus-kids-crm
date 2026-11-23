"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModulo } from "@/lib/auth/guards";
import {
  atualizarContaPagar,
  criarContaPagar,
  desfazerPagamento,
  despesasParaLigar,
  excluirContaPagar,
  marcarContaPaga,
  type AnexoConta,
} from "@/lib/server/contas-pagar";
import { confirmarRascunhoConta } from "@/lib/server/conta-agente";
import { prisma } from "@/lib/db";
import { MAX_PARCELAS, TAMANHO_MAXIMO_ANEXO_CONTA, mimeAnexoConta } from "@/lib/utils/contas-pagar";
import { nomeArquivoSeguro } from "@/lib/utils/negocio-arquivos";

// Contas a pagar na tela (pedido de 2026-11-23). O formulário vai como
// FormData: "dados" (JSON) + "anexo" (foto ou PDF do boleto, opcional).

export type AcaoContaState = { error?: string; success?: boolean; quantidade?: number };

const dadosSchema = z.object({
  vencimento: z.string(),
  valorCentavos: z.number().int(),
  fornecedor: z.string().max(200),
  descricao: z.string().max(500).nullish(),
  categoriaId: z.string().nullable(),
  centroGeralId: z.string().nullable(),
  negocioId: z.string().nullable(),
  codigoPagamento: z.string().max(1000).nullish(),
});

const criarSchema = dadosSchema.extend({
  repeticao: z.enum(["UNICA", "MENSAL", "PARCELADA"]),
  parcelas: z.number().int().min(2).max(MAX_PARCELAS).optional(),
});

const editarSchema = dadosSchema.extend({
  repeteTodoMes: z.boolean().optional(),
  removerAnexo: z.boolean().optional(),
});

function mensagemDeErro(erro: unknown, padrao: string): string {
  if (typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002") {
    return "Essa conta fixa já tem um mês com esse vencimento.";
  }
  if (erro instanceof z.ZodError) return padrao;
  return erro instanceof Error ? erro.message : padrao;
}

async function anexoDoForm(form: FormData): Promise<AnexoConta | undefined> {
  const arquivo = form.get("anexo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return undefined;
  if (arquivo.size > TAMANHO_MAXIMO_ANEXO_CONTA) throw new Error("Arquivo grande demais — o máximo é 4 MB.");
  const mime = mimeAnexoConta(arquivo.type, arquivo.name);
  if (!mime) throw new Error("Mande uma foto ou um PDF do boleto/fatura.");
  return { bytes: Buffer.from(await arquivo.arrayBuffer()), mime, nome: nomeArquivoSeguro(arquivo.name) };
}

function dadosDoForm(form: FormData): unknown {
  return JSON.parse(String(form.get("dados") ?? "{}"));
}

function revalidar() {
  revalidatePath("/financeiro");
}

export async function criarContaPagarAction(form: FormData): Promise<AcaoContaState> {
  const user = await requireModulo("financeiro");
  try {
    const dados = criarSchema.parse(dadosDoForm(form));
    const anexo = await anexoDoForm(form);
    const { quantidade } = await criarContaPagar({ ...dados, anexo, registradaPorId: user.id });
    revalidar();
    return { success: true, quantidade };
  } catch (erro) {
    return { error: mensagemDeErro(erro, "Não consegui registrar a conta.") };
  }
}

export async function atualizarContaPagarAction(id: string, form: FormData): Promise<AcaoContaState> {
  await requireModulo("financeiro");
  try {
    const { removerAnexo, ...dados } = editarSchema.parse(dadosDoForm(form));
    const anexo = await anexoDoForm(form);
    await atualizarContaPagar(id, { ...dados, anexo: anexo ?? (removerAnexo ? null : undefined) });
    revalidar();
    return { success: true };
  } catch (erro) {
    return { error: mensagemDeErro(erro, "Não consegui salvar a conta.") };
  }
}

export async function excluirContaPagarAction(id: string): Promise<AcaoContaState> {
  await requireModulo("financeiro");
  try {
    await excluirContaPagar(id);
    revalidar();
    return { success: true };
  } catch (erro) {
    return { error: mensagemDeErro(erro, "Não consegui excluir a conta.") };
  }
}

export async function despesasParaLigarAction(id: string, dia: string, valorCentavos: number) {
  await requireModulo("financeiro");
  return despesasParaLigar(id, dia, valorCentavos);
}

const pagamentoSchema = z.object({
  dia: z.string(),
  valorCentavos: z.number().int(),
  despesaId: z.string().nullish(),
});

export async function marcarContaPagaAction(id: string, pagamento: z.input<typeof pagamentoSchema>): Promise<AcaoContaState> {
  const user = await requireModulo("financeiro");
  try {
    await marcarContaPaga(id, pagamentoSchema.parse(pagamento), user.id);
    revalidar();
    return { success: true };
  } catch (erro) {
    return { error: mensagemDeErro(erro, "Não consegui marcar a conta como paga.") };
  }
}

export async function desfazerPagamentoAction(id: string): Promise<AcaoContaState> {
  await requireModulo("financeiro");
  try {
    await desfazerPagamento(id);
    revalidar();
    return { success: true };
  } catch (erro) {
    return { error: mensagemDeErro(erro, "Não consegui desfazer o pagamento.") };
  }
}

/** "Lançar" na tela: o rascunho que veio do WhatsApp/Telegram vira conta aberta (parcelas e conta fixa como no agente). */
export async function lancarRascunhoContaAction(id: string): Promise<AcaoContaState> {
  const user = await requireModulo("financeiro");
  try {
    const conta = await prisma.contaPagar.findUnique({ where: { id }, select: { status: true, telefoneOrigem: true } });
    if (conta?.status !== "A_CONFIRMAR") return { error: "Essa conta não está mais esperando confirmação — atualize a tela." };
    await confirmarRascunhoConta(id, conta.telefoneOrigem ?? `crm:${user.id}`);
    const depois = await prisma.contaPagar.findUnique({ where: { id }, select: { status: true } });
    if (depois?.status === "A_CONFIRMAR") return { error: "Ainda falta informar algo (valor, fornecedor, vencimento, categoria ou centro) — edite a conta antes." };
    revalidar();
    return { success: true };
  } catch (erro) {
    return { error: mensagemDeErro(erro, "Não consegui lançar a conta.") };
  }
}
