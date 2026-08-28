"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { criarProduto, atualizarProduto, excluirProduto } from "@/lib/server/produtos";
import { criarProdutoSchema } from "@/lib/validators/produto";
import { reaisParaCentavos } from "@/lib/utils/money";

export type ProdutoFormState = { error?: string; success?: boolean };

export async function criarProdutoAction(
  _prevState: ProdutoFormState,
  formData: FormData,
): Promise<ProdutoFormState> {
  await requireUser();
  const parsed = criarProdutoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await criarProduto({
    nome: parsed.data.nome,
    codigo: parsed.data.codigo || null,
    categoria: parsed.data.categoria,
    descricao: parsed.data.descricao || null,
    valorCentavos: parsed.data.valorReais != null ? reaisParaCentavos(parsed.data.valorReais) : null,
  });

  revalidatePath("/produtos");
  return { success: true };
}

export async function atualizarDescricaoProdutoAction(produtoId: string, descricao: string): Promise<void> {
  await requireUser();
  await atualizarProduto(produtoId, { descricao: descricao || null });
  revalidatePath("/produtos");
}

export async function atualizarValorProdutoAction(produtoId: string, valorReais: number | null): Promise<void> {
  await requireUser();
  await atualizarProduto(produtoId, {
    valorCentavos: valorReais != null && !Number.isNaN(valorReais) ? reaisParaCentavos(valorReais) : null,
  });
  revalidatePath("/produtos");
}

export async function alternarAtivoProdutoAction(produtoId: string, ativo: boolean): Promise<void> {
  await requireUser();
  await atualizarProduto(produtoId, { ativo });
  revalidatePath("/produtos");
}

export async function excluirProdutoAction(produtoId: string): Promise<void> {
  await requireUser();
  await excluirProduto(produtoId);
  revalidatePath("/produtos");
}
