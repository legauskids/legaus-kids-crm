"use server";

import { revalidatePath } from "next/cache";
import type { CampoExtraCategoria } from "@prisma/client";
import { requireUser } from "@/lib/auth/guards";
import { criarCategoriaTarefa, atualizarCategoriaTarefa, moverCategoriaTarefa } from "@/lib/server/categorias-tarefa";
import {
  criarCompromisso,
  atualizarCompromisso,
  atualizarParametrosCompromisso,
  alternarAtivoCompromisso,
  moverCompromisso,
} from "@/lib/server/compromissos-config";

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

// ---------------------------------------------------------------------------
// Compromissos
// ---------------------------------------------------------------------------

function revalidarCompromissos() {
  revalidatePath("/configuracoes");
  revalidatePath("/"); // card de Compromissos no Painel
}

export type EntradaCompromisso = {
  nome: string;
  frequencia: "DIARIA" | "SEMANAL";
  regra: "CATEGORIA" | "PLANEJAR_DIA_SEGUINTE";
  categoriaId: string | null;
  metaDeId: string | null;
  usuarioIds: string[];
  meta: number | null;
  diasUteis: number[];
  horarioCorte: string | null;
};

export async function criarCompromissoAction(entrada: EntradaCompromisso): Promise<ResultadoAcao> {
  const negado = await exigirAdmin();
  if (negado) return { error: negado };
  if (!["DIARIA", "SEMANAL"].includes(entrada.frequencia) || !["CATEGORIA", "PLANEJAR_DIA_SEGUINTE"].includes(entrada.regra)) {
    return { error: "Frequência ou regra inválida." };
  }
  try {
    await criarCompromisso({
      nome: entrada.nome,
      frequencia: entrada.frequencia,
      regra: entrada.regra,
      categoriaId: entrada.categoriaId,
      metaDeId: entrada.metaDeId,
      usuarioIds: entrada.usuarioIds,
      parametros: { meta: entrada.meta, diasUteis: entrada.diasUteis, horarioCorte: entrada.horarioCorte },
    });
  } catch (erro) {
    return { error: mensagem(erro, "Não consegui criar o compromisso.") };
  }
  revalidarCompromissos();
  return {};
}

/** Salva o que mudou: dados gerais (sem versão) e/ou meta, dias e corte (versão nova do período atual em diante). */
export async function salvarCompromissoAction(
  id: string,
  dados: { nome: string; categoriaId: string | null; metaDeId: string | null; usuarioIds: string[] } | null,
  parametros: { meta: number | null; diasUteis: number[]; horarioCorte: string | null } | null,
): Promise<ResultadoAcao> {
  const negado = await exigirAdmin();
  if (negado) return { error: negado };
  try {
    if (dados) await atualizarCompromisso(id, dados);
    if (parametros) await atualizarParametrosCompromisso(id, parametros);
  } catch (erro) {
    return { error: mensagem(erro, "Não consegui salvar o compromisso.") };
  }
  revalidarCompromissos();
  return {};
}

export async function alternarAtivoCompromissoAction(id: string): Promise<ResultadoAcao> {
  const negado = await exigirAdmin();
  if (negado) return { error: negado };
  await alternarAtivoCompromisso(id);
  revalidarCompromissos();
  return {};
}

export async function moverCompromissoAction(id: string, direcao: "cima" | "baixo"): Promise<ResultadoAcao> {
  const negado = await exigirAdmin();
  if (negado) return { error: negado };
  await moverCompromisso(id, direcao === "cima" ? "cima" : "baixo");
  revalidarCompromissos();
  return {};
}
