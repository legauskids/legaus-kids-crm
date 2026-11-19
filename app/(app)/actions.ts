"use server";

import { revalidatePath } from "next/cache";
import { requireAlgumModulo, requireUser } from "@/lib/auth/guards";
import { atualizarMetaDoMes } from "@/lib/server/dashboard";
import { buscarDestinatarios } from "@/lib/server/destinatarios";
import { reaisParaCentavos } from "@/lib/utils/money";
import type { DestinatarioEnvio } from "@/lib/utils/destinatario";

export async function atualizarMetaAction(formData: FormData): Promise<void> {
  await requireUser();
  const valorReais = Number(formData.get("valorReais") ?? 0);
  await atualizarMetaDoMes(reaisParaCentavos(valorReais));
  revalidatePath("/");
}

/** Pra quem mandar orçamento, apresentação ou produto pelo WhatsApp: busca por nome ou telefone. */
export async function buscarDestinatariosAction(termo: string): Promise<DestinatarioEnvio[]> {
  await requireAlgumModulo("orcamentos", "produtos");
  return buscarDestinatarios(termo);
}
