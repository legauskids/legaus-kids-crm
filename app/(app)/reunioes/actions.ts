"use server";

import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/auth/guards";
import { mensagemErroAnthropic } from "@/lib/utils/anthropic-erro";
import {
  criarReuniao,
  atualizarReuniao,
  encerrarReuniao,
  reabrirReuniao,
  excluirReuniao,
  adicionarItemPauta,
  atualizarItemPauta,
  excluirItemPauta,
  moverItemPauta,
  adicionarOpiniao,
  excluirOpiniao,
  criarCompromisso,
  alternarCompromisso,
} from "@/lib/server/reunioes";
import { gerarPautaSugerida, gerarAvaliacaoReuniao, ErroReuniaoIa } from "@/lib/server/reuniao-ia";

export type ResultadoAcao = { error?: string; aviso?: string };

function revalidar(reuniaoId?: string) {
  revalidatePath("/reunioes");
  if (reuniaoId) revalidatePath(`/reunioes/${reuniaoId}`);
}

function mensagem(erro: unknown, padrao: string): string {
  return erro instanceof Error && erro.message ? erro.message : padrao;
}

/** "AAAA-MM-DDTHH:mm" do input datetime-local = horário de Brasília (o servidor roda em UTC). */
function dataHoraBrasilia(valor: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return null;
  const data = new Date(`${valor}:00-03:00`);
  return isNaN(data.getTime()) ? null : data;
}

export async function criarReuniaoAction(tipo: string, dataHora: string, titulo: string): Promise<ResultadoAcao & { id?: string }> {
  const usuario = await requireModulo("reunioes");
  if (tipo !== "SEMANAL" && tipo !== "MENSAL") return { error: "Escolha se a reunião é semanal ou mensal." };
  const data = dataHoraBrasilia(dataHora);
  if (!data) return { error: "Informe dia e horário da reunião." };
  try {
    const reuniao = await criarReuniao({ tipo, data, titulo }, usuario.id);
    revalidar();
    return { id: reuniao.id };
  } catch (erro) {
    return { error: mensagem(erro, "Não consegui criar a reunião.") };
  }
}

export async function atualizarReuniaoAction(
  reuniaoId: string,
  dados: { titulo?: string; dataHora?: string; anotacoes?: string; avaliacao?: string },
): Promise<ResultadoAcao> {
  await requireModulo("reunioes");
  let data: Date | undefined;
  if (dados.dataHora !== undefined) {
    const d = dataHoraBrasilia(dados.dataHora);
    if (!d) return { error: "Data/horário inválido." };
    data = d;
  }
  try {
    await atualizarReuniao(reuniaoId, { titulo: dados.titulo, data, anotacoes: dados.anotacoes, avaliacao: dados.avaliacao });
  } catch (erro) {
    return { error: mensagem(erro, "Não consegui salvar.") };
  }
  revalidar(reuniaoId);
  return {};
}

export async function excluirReuniaoAction(reuniaoId: string): Promise<ResultadoAcao> {
  await requireModulo("reunioes");
  await excluirReuniao(reuniaoId);
  revalidar();
  return {};
}

export async function gerarPautaAction(reuniaoId: string): Promise<ResultadoAcao & { itensCriados?: number }> {
  await requireModulo("reunioes");
  try {
    const { itensCriados } = await gerarPautaSugerida(reuniaoId);
    revalidar(reuniaoId);
    return { itensCriados };
  } catch (erro) {
    // Erros nossos (reunião encerrada, sem chave) passam direto; os da API viram mensagem amigável.
    return { error: erro instanceof ErroReuniaoIa ? erro.message : mensagemErroAnthropic(erro) };
  }
}

/** Encerra (grava a foto dos números) e tenta já gerar a avaliação — se a IA falhar, a reunião fica encerrada do mesmo jeito. */
export async function encerrarReuniaoAction(reuniaoId: string): Promise<ResultadoAcao> {
  await requireModulo("reunioes");
  try {
    await encerrarReuniao(reuniaoId);
  } catch (erro) {
    return { error: mensagem(erro, "Não consegui encerrar a reunião.") };
  }
  let aviso: string | undefined;
  try {
    await gerarAvaliacaoReuniao(reuniaoId);
  } catch (erro) {
    const motivo = erro instanceof ErroReuniaoIa ? erro.message : mensagemErroAnthropic(erro);
    aviso = `Reunião encerrada, mas a avaliação automática falhou: ${motivo} Dá pra gerar de novo pelo botão.`;
  }
  revalidar(reuniaoId);
  return { aviso };
}

export async function gerarAvaliacaoAction(reuniaoId: string): Promise<ResultadoAcao> {
  await requireModulo("reunioes");
  try {
    await gerarAvaliacaoReuniao(reuniaoId);
  } catch (erro) {
    return { error: erro instanceof ErroReuniaoIa ? erro.message : mensagemErroAnthropic(erro) };
  }
  revalidar(reuniaoId);
  return {};
}

export async function reabrirReuniaoAction(reuniaoId: string): Promise<ResultadoAcao> {
  await requireModulo("reunioes");
  await reabrirReuniao(reuniaoId);
  revalidar(reuniaoId);
  return {};
}

export async function adicionarItemPautaAction(reuniaoId: string, titulo: string, descricao: string, link: string): Promise<ResultadoAcao> {
  await requireModulo("reunioes");
  try {
    await adicionarItemPauta(reuniaoId, { titulo, descricao, link: link.startsWith("/") || link.startsWith("#") ? link : null });
  } catch (erro) {
    return { error: mensagem(erro, "Não consegui adicionar o item.") };
  }
  revalidar(reuniaoId);
  return {};
}

export async function atualizarItemPautaAction(
  itemId: string,
  dados: { titulo?: string; descricao?: string; status?: "PENDENTE" | "DISCUTIDO" | "ADIADO"; decisao?: string },
): Promise<ResultadoAcao> {
  await requireModulo("reunioes");
  if (dados.status && !["PENDENTE", "DISCUTIDO", "ADIADO"].includes(dados.status)) return { error: "Status inválido." };
  try {
    const reuniaoId = await atualizarItemPauta(itemId, dados);
    revalidar(reuniaoId);
  } catch (erro) {
    return { error: mensagem(erro, "Não consegui salvar o item.") };
  }
  return {};
}

export async function excluirItemPautaAction(itemId: string): Promise<ResultadoAcao> {
  await requireModulo("reunioes");
  revalidar(await excluirItemPauta(itemId));
  return {};
}

export async function moverItemPautaAction(itemId: string, direcao: "cima" | "baixo"): Promise<ResultadoAcao> {
  await requireModulo("reunioes");
  revalidar(await moverItemPauta(itemId, direcao === "cima" ? "cima" : "baixo"));
  return {};
}

export async function adicionarOpiniaoAction(itemId: string, texto: string): Promise<ResultadoAcao> {
  const usuario = await requireModulo("reunioes");
  try {
    revalidar(await adicionarOpiniao(itemId, usuario.id, texto));
  } catch (erro) {
    return { error: mensagem(erro, "Não consegui salvar a opinião.") };
  }
  return {};
}

export async function excluirOpiniaoAction(opiniaoId: string): Promise<ResultadoAcao> {
  const usuario = await requireModulo("reunioes");
  try {
    revalidar(await excluirOpiniao(opiniaoId, usuario));
  } catch (erro) {
    return { error: mensagem(erro, "Não consegui apagar a opinião.") };
  }
  return {};
}

export async function criarCompromissoAction(
  reuniaoId: string,
  input: { titulo: string; responsavelId: string; prazo: string; descricao?: string },
): Promise<ResultadoAcao> {
  const usuario = await requireModulo("reunioes");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.prazo)) return { error: "Informe até quando." };
  try {
    // Prazo = fim do expediente (18h de Brasília) do dia escolhido.
    await criarCompromisso(
      reuniaoId,
      { titulo: input.titulo, responsavelId: input.responsavelId, prazo: new Date(`${input.prazo}T18:00:00-03:00`), descricao: input.descricao },
      usuario.id,
    );
  } catch (erro) {
    return { error: mensagem(erro, "Não consegui registrar o compromisso.") };
  }
  revalidar(reuniaoId);
  revalidatePath("/tarefas");
  return {};
}

export async function alternarCompromissoAction(tarefaId: string, reuniaoId: string): Promise<ResultadoAcao> {
  await requireModulo("reunioes");
  try {
    await alternarCompromisso(tarefaId);
  } catch (erro) {
    return { error: mensagem(erro, "Não consegui atualizar o compromisso.") };
  }
  revalidar(reuniaoId);
  revalidatePath("/tarefas");
  return {};
}
