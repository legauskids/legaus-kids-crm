"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import {
  salvarOrcamento,
  atualizarStatusOrcamento,
  excluirOrcamento,
  buscarOrcamentoPorId,
  garantirTokenPublico,
  type SalvarOrcamentoInput,
} from "@/lib/server/orcamentos";
import { criarContato } from "@/lib/server/contatos";
import { encontrarOuCriarConversaPorTelefone, registrarMensagem } from "@/lib/server/conversas";
import { enviarEmail, emailConfigurado } from "@/lib/server/email";
import { gerarHtmlEmailOrcamento, gerarTextoAlternativoEmailOrcamento } from "@/lib/server/orcamento-email";
import { reaisParaCentavos, centavosParaReais } from "@/lib/utils/money";
import { URL_BASE } from "@/lib/constants/app";
import type { StatusOrcamento } from "@prisma/client";

export async function criarClienteRapidoAction(input: {
  nome: string;
  telefone?: string;
}): Promise<{ id: string; nome: string } | { error: string }> {
  await requireUser();
  if (!input.nome.trim()) return { error: "Informe um nome." };
  try {
    const contato = await criarContato({ nome: input.nome, telefone: input.telefone || null, tipo: "CLIENTE" });
    revalidatePath("/cadastros");
    return { id: contato.id, nome: contato.nome };
  } catch {
    return { error: "Já existe um cadastro com esse telefone." };
  }
}

export type SalvarOrcamentoState = { error?: string };

export async function salvarOrcamentoAction(input: {
  orcamentoId?: string;
  contatoId?: string | null;
  observacoes?: string;
  descontoReais?: number;
  validadeDias?: number;
  itens: { produtoId?: string | null; nome: string; quantidade: number; valorUnitarioReais: number }[];
}): Promise<{ id: string } | { error: string }> {
  const user = await requireUser();

  if (input.itens.length === 0) {
    return { error: "Adicione pelo menos um item." };
  }
  if (input.itens.some((i) => !i.nome.trim())) {
    return { error: "Todo item precisa de um nome." };
  }

  const payload: SalvarOrcamentoInput = {
    orcamentoId: input.orcamentoId,
    contatoId: input.contatoId || null,
    responsavelId: user.id,
    observacoes: input.observacoes || null,
    descontoCentavos: input.descontoReais ? reaisParaCentavos(input.descontoReais) : 0,
    validadeDias: input.validadeDias ?? 15,
    itens: input.itens.map((i) => ({
      produtoId: i.produtoId || null,
      nome: i.nome,
      quantidade: Math.max(1, Math.round(i.quantidade)),
      valorUnitarioCentavos: reaisParaCentavos(i.valorUnitarioReais || 0),
    })),
  };

  const orcamento = await salvarOrcamento(payload);
  revalidatePath("/orcamentos");
  revalidatePath(`/orcamentos/${orcamento.id}`);
  return { id: orcamento.id };
}

export async function atualizarStatusOrcamentoAction(id: string, status: StatusOrcamento): Promise<void> {
  await requireUser();
  await atualizarStatusOrcamento(id, status);
  revalidatePath("/orcamentos");
  revalidatePath(`/orcamentos/${id}`);
}

export async function excluirOrcamentoAction(id: string): Promise<void> {
  await requireUser();
  await excluirOrcamento(id);
  revalidatePath("/orcamentos");
  redirect("/orcamentos");
}

type EnvioResultado = { ok: true; link: string } | { error: string };

/** Gera o link público do orçamento (criando o token se ainda não existir). */
export async function obterLinkPublicoOrcamentoAction(orcamentoId: string): Promise<{ link: string }> {
  await requireUser();
  const token = await garantirTokenPublico(orcamentoId);
  return { link: `${URL_BASE}/publico/orcamento/${token}` };
}

export async function enviarOrcamentoWhatsAppAction(orcamentoId: string, telefoneDestino: string): Promise<EnvioResultado> {
  await requireUser();

  const telefone = telefoneDestino.replace(/\D/g, "");
  if (telefone.length < 10) {
    return { error: "Telefone inválido." };
  }

  const orcamento = await buscarOrcamentoPorId(orcamentoId);
  if (!orcamento) return { error: "Orçamento não encontrado." };

  const token = await garantirTokenPublico(orcamentoId);
  const link = `${URL_BASE}/publico/orcamento/${token}`;
  const total = orcamento.itens.reduce((soma, i) => soma + i.quantidade * i.valorUnitarioCentavos, 0) - orcamento.descontoCentavos;

  const texto =
    `Olá! Segue o orçamento *#${String(orcamento.numero).padStart(4, "0")}* da Legaus Kids, ` +
    `no valor de ${centavosParaReais(Math.max(0, total))}.\n\n` +
    `Você pode conferir todos os detalhes aqui: ${link}\n\n` +
    `Qualquer dúvida, estamos à disposição!`;

  try {
    const conversa = await encontrarOuCriarConversaPorTelefone({
      telefone,
      nomeContato: orcamento.contato?.nome,
    });
    await registrarMensagem({ conversaId: conversa.id, texto, direcao: "SAIDA", origem: "SISTEMA" });
  } catch {
    return { error: "Não foi possível enviar pelo WhatsApp agora." };
  }

  revalidatePath("/atendimento");
  return { ok: true, link };
}

export async function enviarOrcamentoEmailAction(orcamentoId: string, emailDestino: string): Promise<EnvioResultado> {
  await requireUser();

  if (!emailConfigurado()) {
    return { error: "Envio de e-mail ainda não configurado. Fale com o suporte pra ativar." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDestino)) {
    return { error: "E-mail inválido." };
  }

  const orcamento = await buscarOrcamentoPorId(orcamentoId);
  if (!orcamento) return { error: "Orçamento não encontrado." };

  const token = await garantirTokenPublico(orcamentoId);
  const link = `${URL_BASE}/publico/orcamento/${token}`;

  const html = gerarHtmlEmailOrcamento({
    numero: orcamento.numero,
    status: orcamento.status,
    validadeDias: orcamento.validadeDias,
    createdAt: orcamento.createdAt,
    observacoes: orcamento.observacoes,
    descontoCentavos: orcamento.descontoCentavos,
    clienteNome: orcamento.contato?.nome ?? "cliente",
    itens: orcamento.itens.map((i) => ({
      nome: i.nome,
      quantidade: i.quantidade,
      valorUnitarioCentavos: i.valorUnitarioCentavos,
      imagemUrl: i.produto?.imagemUrl ?? null,
    })),
    link,
  });

  try {
    await enviarEmail({
      para: emailDestino,
      assunto: `Orçamento nº ${String(orcamento.numero).padStart(4, "0")} — Legaus Kids`,
      html,
      textoAlternativo: gerarTextoAlternativoEmailOrcamento(orcamento.numero, link),
    });
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : "Não foi possível enviar o e-mail agora." };
  }

  return { ok: true, link };
}
