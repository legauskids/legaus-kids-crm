"use server";

import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/auth/guards";
import {
  criarPostagem,
  atualizarLegendaPostagem,
  atualizarStatusPostagem,
  excluirPostagem,
  definirVarianteEscolhida,
  editarImagemDaPostagem,
  salvarModelo,
  criarModelo,
  excluirModelo,
} from "@/lib/server/marketing";
import type { TipoPostagem, StatusPostagem } from "@prisma/client";

function revalidateMarketing() {
  revalidatePath("/marketing");
}

export type PostagemFormState = { error?: string; success?: boolean; ids?: string[] };

const TIPOS_VALIDOS = ["FEED_INSTAGRAM", "STORY_INSTAGRAM", "STATUS_WHATSAPP", "FEED_FACEBOOK"];

export async function criarPostagemAction(
  _prevState: PostagemFormState,
  formData: FormData,
): Promise<PostagemFormState> {
  const user = await requireModulo("marketing");
  const arquivos = formData.getAll("imagens").filter((a): a is File => a instanceof File && a.size > 0);
  const tipos = formData.getAll("tipos").map(String).filter((t) => TIPOS_VALIDOS.includes(t));
  const contexto = String(formData.get("contexto") ?? "").trim();
  const headline = String(formData.get("headline") ?? "").trim();

  if (arquivos.length === 0) {
    return { error: "Escolha ao menos uma imagem." };
  }
  if (tipos.length === 0) {
    return { error: "Escolha ao menos um lugar pra postar." };
  }

  try {
    const imagens = await Promise.all(
      arquivos.map(async (arquivo) => ({
        buffer: Buffer.from(await arquivo.arrayBuffer()),
        mime: arquivo.type || "image/jpeg",
      })),
    );
    // uma postagem por destino selecionado — cada tipo tem seu próprio
    // enquadramento (feed x story) e formato de legenda.
    const criadas = await Promise.all(
      tipos.map((tipo) =>
        criarPostagem({
          tipo: tipo as TipoPostagem,
          contexto,
          headline: headline || undefined,
          imagens,
          criadoPorId: user.id,
        }),
      ),
    );
    revalidateMarketing();
    return { success: true, ids: criadas.map((p) => p.id) };
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : "Não consegui processar as imagens." };
  }
}

export async function definirVarianteEscolhidaAction(postagemImagemId: string, varianteId: string): Promise<void> {
  await requireModulo("marketing");
  await definirVarianteEscolhida(postagemImagemId, varianteId);
  revalidateMarketing();
}

export type EditarImagemIAState = { error?: string; success?: boolean };

export async function editarImagemComIAAction(
  postagemImagemId: string,
  instrucao: string,
): Promise<EditarImagemIAState> {
  await requireModulo("marketing");
  if (!instrucao.trim()) return { error: "Descreva o que você quer mudar na foto." };

  try {
    await editarImagemDaPostagem(postagemImagemId, instrucao.trim());
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : "Não consegui editar a imagem." };
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
