"use server";

import { revalidatePath } from "next/cache";
import type { CampoExtraCategoria } from "@prisma/client";
import { requireUser } from "@/lib/auth/guards";
import { criarCategoriaTarefa, atualizarCategoriaTarefa, moverCategoriaTarefa } from "@/lib/server/categorias-tarefa";

export type ResultadoAcao = { error?: string };

const CAMPOS_EXTRA: CampoExtraCategoria[] = ["NENHUM", "LINK", "PAUTA"];

async function exigirAdmin(): Promise<string | null> {
  const user = await requireUser();
  return user.isAdmin ? null : "Só o administrador pode mudar as configurações.";
}

// As categorias ficam no layout do CRM (contexto pra todas as telas) — por isso
// revalida o layout inteiro, não só esta página.
function revalidar() {
  revalidatePath("/", "layout");
}

function mensagem(erro: unknown, padrao: string) {
  return erro instanceof Error && erro.message ? erro.message : padrao;
}

export async function criarCategoriaTarefaAction(nome: string, cor: string, campoExtra: string): Promise<ResultadoAcao> {
  const negado = await exigirAdmin();
  if (negado) return { error: negado };
  if (!CAMPOS_EXTRA.includes(campoExtra as CampoExtraCategoria)) return { error: "Campo extra inválido." };
  try {
    await criarCategoriaTarefa({ nome, cor, campoExtra: campoExtra as CampoExtraCategoria });
  } catch (erro) {
    return { error: mensagem(erro, "Não consegui criar a categoria.") };
  }
  revalidar();
  return {};
}

export async function atualizarCategoriaTarefaAction(
  id: string,
  dados: { nome?: string; cor?: string; campoExtra?: string; ativa?: boolean },
): Promise<ResultadoAcao> {
  const negado = await exigirAdmin();
  if (negado) return { error: negado };
  if (dados.campoExtra && !CAMPOS_EXTRA.includes(dados.campoExtra as CampoExtraCategoria)) return { error: "Campo extra inválido." };
  try {
    await atualizarCategoriaTarefa(id, { ...dados, campoExtra: dados.campoExtra as CampoExtraCategoria | undefined });
  } catch (erro) {
    return { error: mensagem(erro, "Não consegui salvar a categoria.") };
  }
  revalidar();
  return {};
}

export async function moverCategoriaTarefaAction(id: string, direcao: "cima" | "baixo"): Promise<ResultadoAcao> {
  const negado = await exigirAdmin();
  if (negado) return { error: negado };
  await moverCategoriaTarefa(id, direcao === "cima" ? "cima" : "baixo");
  revalidar();
  return {};
}
