"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { criarFunil, criarEtapa, atualizarEtapa, reordenarEtapas } from "@/lib/server/funis";

export async function criarFunilAction(nome: string): Promise<void> {
  await requireUser();
  if (!nome.trim()) return;
  await criarFunil(nome.trim());
  revalidatePath("/negocios/funis");
  revalidatePath("/negocios");
}

export async function criarEtapaAction(funilId: string, nome: string, slaDias: number | null): Promise<void> {
  await requireUser();
  if (!nome.trim()) return;
  await criarEtapa(funilId, nome.trim(), slaDias);
  revalidatePath("/negocios/funis");
  revalidatePath("/negocios");
}

export async function atualizarEtapaAction(
  etapaId: string,
  input: { nome?: string; slaDias?: number | null },
): Promise<void> {
  await requireUser();
  await atualizarEtapa(etapaId, input);
  revalidatePath("/negocios/funis");
  revalidatePath("/negocios");
}

export async function reordenarEtapasAction(etapaIdsEmOrdem: string[]): Promise<void> {
  await requireUser();
  await reordenarEtapas(etapaIdsEmOrdem);
  revalidatePath("/negocios/funis");
  revalidatePath("/negocios");
}
