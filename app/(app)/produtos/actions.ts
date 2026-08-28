"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { criarProduto, atualizarProduto, excluirProduto, atualizarPrecoProduto, type CampoPrecoProduto } from "@/lib/server/produtos";
import { criarProdutoSchema, atualizarProdutoSchema } from "@/lib/validators/produto";
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
    imagemUrl: parsed.data.imagemUrl || null,
    valorCentavos: parsed.data.valorReais != null ? reaisParaCentavos(parsed.data.valorReais) : null,
  });

  revalidatePath("/produtos");
  revalidatePath("/cadastros");
  return { success: true };
}

export async function atualizarProdutoAction(
  _prevState: ProdutoFormState,
  formData: FormData,
): Promise<ProdutoFormState> {
  await requireUser();
  const parsed = atualizarProdutoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await atualizarProduto(parsed.data.produtoId, {
    nome: parsed.data.nome,
    codigo: parsed.data.codigo || null,
    categoria: parsed.data.categoria,
    descricao: parsed.data.descricao || null,
    imagemUrl: parsed.data.imagemUrl || null,
    valorCentavos: parsed.data.valorReais != null ? reaisParaCentavos(parsed.data.valorReais) : null,
    ativo: parsed.data.ativo === "true",
  });

  revalidatePath("/produtos");
  revalidatePath("/cadastros");
  return { success: true };
}

export async function excluirProdutoAction(produtoId: string): Promise<void> {
  await requireUser();
  await excluirProduto(produtoId);
  revalidatePath("/produtos");
  revalidatePath("/cadastros");
}

const CAMPOS_PRECO_VALIDOS = new Set<CampoPrecoProduto>([
  "custoCompraCentavos",
  "freteCustoCentavos",
  "ipiCustoCentavos",
  "outrosCustoCentavos",
  "quantidadeReferencia",
  "markupPercentual",
  "impostoPercentual",
  "instalacaoCentavos",
]);

export async function atualizarPrecoProdutoAction(
  produtoId: string,
  campo: CampoPrecoProduto,
  valor: number | null,
): Promise<{ valorCentavos: number | null } | { error: string }> {
  await requireUser();
  if (!CAMPOS_PRECO_VALIDOS.has(campo)) {
    return { error: "Campo inválido." };
  }
  if (valor != null && !Number.isFinite(valor)) {
    return { error: "Valor inválido." };
  }

  // Sem revalidatePath aqui de propósito: a planilha já mantém o estado
  // otimista no cliente por linha editada, e um revalidate a cada blur de
  // célula fazia o Next.js reidratar a árvore de Server Components e
  // sobrescrever a edição em andamento com dado ainda não sincronizado.
  const produto = await atualizarPrecoProduto(produtoId, campo, valor);
  return { valorCentavos: produto.valorCentavos };
}
