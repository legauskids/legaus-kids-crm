"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { atualizarMetaDoMes } from "@/lib/server/dashboard";
import { reaisParaCentavos } from "@/lib/utils/money";

export async function atualizarMetaAction(formData: FormData): Promise<void> {
  await requireUser();
  const valorReais = Number(formData.get("valorReais") ?? 0);
  await atualizarMetaDoMes(reaisParaCentavos(valorReais));
  revalidatePath("/");
}
