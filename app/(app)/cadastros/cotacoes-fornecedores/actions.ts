"use server";

import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/auth/guards";
import { excluirCotacaoFornecedor } from "@/lib/server/cotacoes-fornecedores";

/** Aba Cotações de fornecedores (Cadastros): apagar, com itens e arquivos. */
export async function excluirCotacaoFornecedorAction(id: string): Promise<{ error?: string }> {
  await requireModulo("contatos");
  try {
    await excluirCotacaoFornecedor(id);
  } catch {
    return { error: "Não consegui apagar — atualize a tela e tente de novo." };
  }
  revalidatePath("/cadastros");
  return {};
}
