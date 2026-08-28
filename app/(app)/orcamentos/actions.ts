"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import {
  salvarOrcamento,
  atualizarStatusOrcamento,
  excluirOrcamento,
  type SalvarOrcamentoInput,
} from "@/lib/server/orcamentos";
import { criarContato } from "@/lib/server/contatos";
import { reaisParaCentavos } from "@/lib/utils/money";
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
