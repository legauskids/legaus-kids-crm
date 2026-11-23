"use server";

import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/auth/guards";
import { moduloPermitido } from "@/lib/auth/permissoes";
import { listarOrcamentosParaAnexar, type OrcamentoParaAnexar } from "@/lib/server/orcamentos";
import { anexarOrcamentoAoNegocio } from "@/lib/server/orcamento-negocio";

// "Anexar orçamento" do histórico do negócio (pedido de 2026-11-23).

const SEM_ACESSO = "Sem acesso a Orçamentos.";

export async function listarOrcamentosParaAnexarAction(negocioId: string): Promise<{ orcamentos: OrcamentoParaAnexar[] } | { error: string }> {
  const user = await requireModulo("negocios");
  if (!moduloPermitido(user, "orcamentos")) return { error: SEM_ACESSO };
  return { orcamentos: await listarOrcamentosParaAnexar(negocioId) };
}

export async function anexarOrcamentoAction(negocioId: string, orcamentoId: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireModulo("negocios");
  if (!moduloPermitido(user, "orcamentos")) return { error: SEM_ACESSO };
  try {
    await anexarOrcamentoAoNegocio(negocioId, orcamentoId, user.id);
  } catch (e) {
    return { error: e instanceof Error && e.message ? e.message : "Não consegui anexar o orçamento." };
  }
  revalidatePath(`/negocios/${negocioId}`);
  revalidatePath(`/orcamentos/${orcamentoId}`);
  return { ok: true };
}
