"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { gerarApiToken } from "@/lib/auth/api-token";

export async function gerarApiTokenAction(): Promise<void> {
  const user = await requireUser();
  await gerarApiToken(user.id);
  revalidatePath("/extensao");
}
