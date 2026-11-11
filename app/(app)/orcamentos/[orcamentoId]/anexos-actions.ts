"use server";

import { requireModulo } from "@/lib/auth/guards";
import { excluirAnexoOrcamento, guardarAnexoOrcamento, salvarAnexosOrcamento } from "@/lib/server/anexos-orcamento";
import type { AnexoOrcamentoVM, AnexoParaSalvar } from "@/lib/utils/anexos-orcamento";

// Imagens anexas ao orçamento (anexos-orcamento.tsx). Sem revalidatePath: a
// tela guarda o estado dela, e a impressão, o link público e o PDF leem do
// banco na hora.

const mensagemDeErro = (e: unknown, padrao: string) => (e instanceof Error && e.message ? e.message : padrao);

export async function enviarAnexoOrcamentoAction(orcamentoId: string, form: FormData): Promise<{ anexo: AnexoOrcamentoVM } | { error: string }> {
  await requireModulo("orcamentos");
  const arquivo = form.get("imagem");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { error: "Escolha uma imagem." };
  try {
    return { anexo: await guardarAnexoOrcamento(orcamentoId, Buffer.from(await arquivo.arrayBuffer()), arquivo.name || null) };
  } catch (e) {
    return { error: mensagemDeErro(e, "Não consegui guardar a imagem.") };
  }
}

export async function salvarAnexosOrcamentoAction(orcamentoId: string, anexos: AnexoParaSalvar[]): Promise<{ ok: true } | { error: string }> {
  await requireModulo("orcamentos");
  try {
    await salvarAnexosOrcamento(orcamentoId, anexos);
    return { ok: true };
  } catch (e) {
    return { error: mensagemDeErro(e, "Não consegui salvar as imagens anexas.") };
  }
}

export async function excluirAnexoOrcamentoAction(orcamentoId: string, anexoId: string): Promise<void> {
  await requireModulo("orcamentos");
  await excluirAnexoOrcamento(orcamentoId, anexoId);
}
