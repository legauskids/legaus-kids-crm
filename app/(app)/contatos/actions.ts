"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { criarContato, atualizarContato } from "@/lib/server/contatos";
import { criarContatoSchema, atualizarContatoSchema } from "@/lib/validators/contato";

export type ContatoFormState = { error?: string; success?: boolean };

export async function criarContatoAction(
  _prevState: ContatoFormState,
  formData: FormData,
): Promise<ContatoFormState> {
  await requireUser();
  const parsed = criarContatoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await criarContato({
      nome: parsed.data.nome,
      telefone: parsed.data.telefone,
      empresa: parsed.data.empresa || null,
    });
  } catch {
    return { error: "Já existe um contato com esse telefone." };
  }

  revalidatePath("/contatos");
  return { success: true };
}

export async function atualizarContatoAction(
  _prevState: ContatoFormState,
  formData: FormData,
): Promise<ContatoFormState> {
  await requireUser();
  const parsed = atualizarContatoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const tags = parsed.data.tags
    ? parsed.data.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : undefined;

  await atualizarContato(parsed.data.contatoId, {
    nome: parsed.data.nome,
    empresa: parsed.data.empresa || null,
    tags,
  });

  revalidatePath("/contatos");
  return { success: true };
}
