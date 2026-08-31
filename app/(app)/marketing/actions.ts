"use server";

import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/auth/guards";
import {
  criarPostagem,
  atualizarLegendaPostagem,
  atualizarStatusPostagem,
  excluirPostagem,
  salvarModelo,
  criarModelo,
  excluirModelo,
} from "@/lib/server/marketing";
import type { TipoPostagem, StatusPostagem } from "@prisma/client";

function revalidateMarketing() {
  revalidatePath("/marketing");
}

export type PostagemFormState = { error?: string; success?: boolean };

export async function criarPostagemAction(
  _prevState: PostagemFormState,
  formData: FormData,
): Promise<PostagemFormState> {
  const user = await requireModulo("marketing");
  const arquivo = formData.get("imagem");
  const tipo = String(formData.get("tipo") ?? "");
  const contexto = String(formData.get("contexto") ?? "").trim();

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { error: "Escolha uma imagem." };
  }
  if (!["FEED_INSTAGRAM", "STORY_INSTAGRAM", "STATUS_WHATSAPP", "FEED_FACEBOOK"].includes(tipo)) {
    return { error: "Escolha o tipo de postagem." };
  }

  try {
    const arrayBuffer = await arquivo.arrayBuffer();
    await criarPostagem({
      tipo: tipo as TipoPostagem,
      contexto,
      imagemBuffer: Buffer.from(arrayBuffer),
      imagemMime: arquivo.type || "image/jpeg",
      criadoPorId: user.id,
    });
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : "Não consegui processar a imagem." };
  }

  revalidateMarketing();
  return { success: true };
}

export async function atualizarLegendaAction(id: string, legenda: string): Promise<void> {
  await requireModulo("marketing");
  await atualizarLegendaPostagem(id, legenda);
  revalidateMarketing();
}

export async function atualizarStatusPostagemAction(id: string, status: StatusPostagem): Promise<void> {
  await requireModulo("marketing");
  await atualizarStatusPostagem(id, status);
  revalidateMarketing();
}

export async function excluirPostagemAction(id: string): Promise<void> {
  await requireModulo("marketing");
  await excluirPostagem(id);
  revalidateMarketing();
}

export async function salvarModeloAction(id: string, legendaModelo: string): Promise<void> {
  await requireModulo("marketing");
  await salvarModelo(id, legendaModelo);
  revalidateMarketing();
}

export type ModeloFormState = { error?: string; success?: boolean };

export async function criarModeloAction(
  _prevState: ModeloFormState,
  formData: FormData,
): Promise<ModeloFormState> {
  await requireModulo("marketing");
  const titulo = String(formData.get("titulo") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "");
  const legendaModelo = String(formData.get("legendaModelo") ?? "").trim();

  if (!titulo || !legendaModelo) return { error: "Preencha título e texto do modelo." };
  if (!["FEED_INSTAGRAM", "STORY_INSTAGRAM", "STATUS_WHATSAPP", "FEED_FACEBOOK"].includes(tipo)) {
    return { error: "Escolha o tipo." };
  }

  await criarModelo({ titulo, tipo: tipo as TipoPostagem, legendaModelo });
  revalidateMarketing();
  return { success: true };
}

export async function excluirModeloAction(id: string): Promise<void> {
  await requireModulo("marketing");
  await excluirModelo(id);
  revalidateMarketing();
}
