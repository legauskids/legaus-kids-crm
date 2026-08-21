"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { marcarLembreteLido } from "@/lib/server/lembretes";

export async function marcarLembreteComoLido(lembreteId: string): Promise<void> {
  await requireUser();
  await marcarLembreteLido(lembreteId);
  revalidatePath("/", "layout");
}
