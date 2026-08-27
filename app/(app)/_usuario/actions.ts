"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import {
  trocarPropriaSenha,
  adminTrocarSenhaDeUsuario,
  adminAtualizarPermissoes,
} from "@/lib/server/usuarios";
import type { ModuloKey } from "@/lib/auth/permissoes";

export type SenhaState = { error?: string; success?: boolean };

export async function trocarPropriaSenhaAction(
  _prevState: SenhaState,
  formData: FormData,
): Promise<SenhaState> {
  const user = await requireUser();
  const senhaAtual = String(formData.get("senhaAtual") ?? "");
  const novaSenha = String(formData.get("novaSenha") ?? "");
  const confirmarSenha = String(formData.get("confirmarSenha") ?? "");

  if (novaSenha !== confirmarSenha) {
    return { error: "A confirmação não bate com a nova senha." };
  }

  try {
    await trocarPropriaSenha(user.id, senhaAtual, novaSenha);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível trocar a senha." };
  }
  return { success: true };
}

export async function adminTrocarSenhaAction(
  _prevState: SenhaState,
  formData: FormData,
): Promise<SenhaState> {
  const admin = await requireUser();
  const usuarioId = String(formData.get("usuarioId") ?? "");
  const novaSenha = String(formData.get("novaSenha") ?? "");
  const confirmarSenha = String(formData.get("confirmarSenha") ?? "");

  if (novaSenha !== confirmarSenha) {
    return { error: "A confirmação não bate com a nova senha." };
  }

  try {
    await adminTrocarSenhaDeUsuario(admin.id, usuarioId, novaSenha);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível trocar a senha." };
  }
  return { success: true };
}

export async function adminAtualizarPermissaoAction(
  usuarioId: string,
  modulo: ModuloKey,
  visivel: boolean,
): Promise<void> {
  const admin = await requireUser();
  await adminAtualizarPermissoes(admin.id, usuarioId, modulo, visivel);
  revalidatePath("/", "layout");
}
