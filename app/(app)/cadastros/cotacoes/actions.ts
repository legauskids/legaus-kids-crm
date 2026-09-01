"use server";

import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/auth/guards";
import {
  criarCotacao,
  atualizarTituloCotacao,
  atualizarCampoResumoCotacao,
  atualizarMaoDeObraCotacao,
  criarItemCotacao,
  atualizarItemCotacao,
  excluirItemCotacao,
  excluirCotacao,
  type CampoResumoCotacao,
  type CampoItemCotacao,
} from "@/lib/server/cotacoes";
import type { TipoCotacao } from "@prisma/client";

function revalidateCotacoes() {
  revalidatePath("/cadastros");
}

export async function criarCotacaoAction(tipo: TipoCotacao): Promise<{ id: string }> {
  const user = await requireModulo("contatos");
  const cotacao = await criarCotacao(tipo, user.id);
  revalidateCotacoes();
  return { id: cotacao.id };
}

export async function atualizarTituloCotacaoAction(id: string, titulo: string): Promise<void> {
  await requireModulo("contatos");
  await atualizarTituloCotacao(id, titulo);
  revalidateCotacoes();
}

export async function atualizarCampoResumoCotacaoAction(id: string, campo: CampoResumoCotacao, valor: number): Promise<void> {
  await requireModulo("contatos");
  await atualizarCampoResumoCotacao(id, campo, valor);
  revalidateCotacoes();
}

export async function atualizarMaoDeObraCotacaoAction(id: string, indice: number, valorCentavos: number): Promise<void> {
  await requireModulo("contatos");
  await atualizarMaoDeObraCotacao(id, indice, valorCentavos);
  revalidateCotacoes();
}

export async function criarItemCotacaoAction(cotacaoId: string, secao: string): Promise<{ id: string }> {
  await requireModulo("contatos");
  const item = await criarItemCotacao(cotacaoId, secao);
  revalidateCotacoes();
  return { id: item.id };
}

export async function atualizarItemCotacaoAction(itemId: string, campo: CampoItemCotacao, valor: string | number): Promise<void> {
  await requireModulo("contatos");
  await atualizarItemCotacao(itemId, campo, valor);
  revalidateCotacoes();
}

export async function excluirItemCotacaoAction(itemId: string): Promise<void> {
  await requireModulo("contatos");
  await excluirItemCotacao(itemId);
  revalidateCotacoes();
}

export async function excluirCotacaoAction(id: string): Promise<void> {
  await requireModulo("contatos");
  await excluirCotacao(id);
  revalidateCotacoes();
}
