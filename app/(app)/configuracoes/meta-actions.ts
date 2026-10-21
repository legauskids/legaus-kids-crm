"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { conectarMeta, desconectarMeta, verificarConexao, type ResultadoConexao } from "@/lib/server/meta";
import type { PaginaMeta } from "@/lib/utils/meta-publicacao";

// Conexão com o Instagram e a Página do Facebook (etapa 3 dos posts,
// 2026-10-21). Só administrador.

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function admin() {
  const user = await requireUser();
  if (!user.isAdmin) throw new Error("Só o administrador conecta o Instagram e o Facebook.");
  return user;
}

function revalidar() {
  revalidatePath("/configuracoes");
  revalidatePath("/marketing", "layout");
}

export async function conectarMetaAction(
  token: string,
  paginaId?: string,
): Promise<Resultado<{ conexao: Extract<ResultadoConexao, { ok: true }> }> | { ok: false; escolher: PaginaMeta[] }> {
  try {
    const user = await admin();
    const r = await conectarMeta(token, user.id, paginaId);
    if ("erro" in r) return { ok: false, error: r.erro };
    if ("escolher" in r) return { ok: false, escolher: r.escolher };
    revalidar();
    return { ok: true, conexao: r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não consegui conectar." };
  }
}

export async function testarConexaoMetaAction(): Promise<Resultado> {
  try {
    await admin();
    const r = await verificarConexao();
    revalidar();
    return r.ok ? { ok: true } : { ok: false, error: r.erro };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não consegui testar." };
  }
}

export async function desconectarMetaAction(): Promise<Resultado> {
  try {
    await admin();
    await desconectarMeta();
    revalidar();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não consegui desconectar." };
  }
}
