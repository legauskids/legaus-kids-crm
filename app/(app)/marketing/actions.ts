"use server";

import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/auth/guards";
import {
  adicionarFoto,
  atualizarLegendaPostagem,
  atualizarStatusPostagem,
  atualizarTextosPostagem,
  criarPostagem,
  excluirPostagem,
  gerarLegendaDaPostagem,
  montarArtesDaPostagem,
  salvarDadosArte,
  trocarFotosPorSlide,
} from "@/lib/server/marketing";
import { comMaiuscula, type ConteudoPostagem, type DadosArte, type TextosPostagem } from "@/lib/utils/postagem-arte";
import { conversarSobrePost } from "@/lib/server/marketing-agente";
import { transcreverAudio } from "@/lib/server/transcricao";
import type { StatusPostagem } from "@prisma/client";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function revalidar(id?: string) {
  revalidatePath("/marketing");
  if (id) revalidatePath(`/marketing/${id}`);
}

function erro(e: unknown, padrao: string): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : padrao };
}

const CONTEUDOS: ConteudoPostagem[] = ["ENTREGA", "INSTALACAO", "TBT", "PRODUTO", "BENEFICIOS"];

export type NovaPostagemInput = {
  conteudo: ConteudoPostagem;
  produto?: string;
  cliente?: string;
  cidade?: string;
  negocioId?: string;
  preco?: string;
  argumentos?: string;
  contexto?: string;
  local?: string;
  fotosPorSlide?: 1 | 2;
};

export async function criarPostagemAction(input: NovaPostagemInput): Promise<Resultado<{ id: string }>> {
  const user = await requireModulo("marketing");
  if (!CONTEUDOS.includes(input.conteudo)) return { ok: false, error: "Escolha o tipo do post." };
  if (input.conteudo === "BENEFICIOS" && !input.argumentos?.trim()) return { ok: false, error: "Escreva os argumentos, um por linha." };
  try {
    const p = await criarPostagem({
      ...input,
      argumentos: input.argumentos?.split("\n"),
      criadoPorId: user.id,
    });
    return { ok: true, id: p.id };
  } catch (e) {
    return erro(e, "Não consegui criar o post.");
  }
}

/** Uma foto por chamada — o celular já reduz antes de mandar. */
export async function enviarFotoAction(postagemId: string, formData: FormData): Promise<Resultado> {
  await requireModulo("marketing");
  const foto = formData.get("foto");
  if (!(foto instanceof File) || foto.size === 0) return { ok: false, error: "Foto vazia." };
  try {
    await adicionarFoto(postagemId, Buffer.from(await foto.arrayBuffer()), foto.type);
    return { ok: true };
  } catch (e) {
    return erro(e, "Não consegui ler essa foto.");
  }
}

/** Depois das fotos: monta as artes e pede a legenda à IA. */
export async function concluirPostagemAction(postagemId: string): Promise<Resultado<{ legendaGerada: boolean }>> {
  await requireModulo("marketing");
  try {
    await montarArtesDaPostagem(postagemId);
    const legenda = await gerarLegendaDaPostagem(postagemId);
    revalidar(postagemId);
    return { ok: true, legendaGerada: Boolean(legenda) };
  } catch (e) {
    return erro(e, "Não consegui montar as artes.");
  }
}

export async function gerarLegendaAction(postagemId: string): Promise<Resultado<{ legenda: string }>> {
  await requireModulo("marketing");
  const legenda = await gerarLegendaDaPostagem(postagemId);
  if (!legenda) return { ok: false, error: "A IA não respondeu agora — tente de novo ou escreva a legenda." };
  revalidar(postagemId);
  return { ok: true, legenda };
}

export async function salvarLegendaAction(postagemId: string, legenda: string): Promise<Resultado> {
  await requireModulo("marketing");
  await atualizarLegendaPostagem(postagemId, legenda.trim());
  revalidar(postagemId);
  return { ok: true };
}

export async function salvarTextosAction(postagemId: string, textos: TextosPostagem): Promise<Resultado> {
  await requireModulo("marketing");
  const limpos: TextosPostagem = {
    titulo: [comMaiuscula(textos.titulo[0] ?? ""), comMaiuscula(textos.titulo[1] ?? "")],
    // No máximo 3 informações por imagem: título + 2 selos.
    selos: textos.selos.map(comMaiuscula).filter(Boolean).slice(0, 2),
    preco: textos.preco?.trim() || null,
    argumentos: (textos.argumentos ?? []).map(comMaiuscula).filter(Boolean),
    local: textos.local?.trim() || null,
  };
  if (!limpos.titulo[0] && !limpos.titulo[1]) return { ok: false, error: "O título não pode ficar vazio." };
  try {
    await atualizarTextosPostagem(postagemId, limpos);
    revalidar(postagemId);
    return { ok: true };
  } catch (e) {
    return erro(e, "Não consegui refazer as artes.");
  }
}

/** Ajustes do editor de uma arte (posições, tamanhos, textos, foto e enquadramento). */
export async function salvarArteAction(arteId: string, dados: Partial<DadosArte>): Promise<Resultado<{ voltouPraRevisao: boolean }>> {
  await requireModulo("marketing");
  try {
    const r = await salvarDadosArte(arteId, dados);
    revalidar(r.postagemId);
    revalidatePath(`/marketing/${r.postagemId}/arte/${arteId}`);
    return { ok: true, voltouPraRevisao: r.voltouPraRevisao };
  } catch (e) {
    return erro(e, "Não consegui salvar os ajustes.");
  }
}

export async function mudarStatusAction(postagemId: string, status: StatusPostagem): Promise<Resultado> {
  await requireModulo("marketing");
  if (!["AGUARDANDO_APROVACAO", "APROVADO", "RECUSADO"].includes(status)) return { ok: false, error: "Status inválido." };
  await atualizarStatusPostagem(postagemId, status);
  revalidar(postagemId);
  return { ok: true };
}

export async function excluirPostagemAction(postagemId: string): Promise<Resultado> {
  await requireModulo("marketing");
  await excluirPostagem(postagemId);
  revalidar();
  return { ok: true };
}

/** Mensagem pro Claude do post (assistente do Marketing): responde e pode ajustar artes e legenda. */
export async function conversarAction(postagemId: string, texto: string): Promise<Resultado<{ resposta: string; mudou: boolean }>> {
  const user = await requireModulo("marketing");
  const t = texto.trim();
  if (!t) return { ok: false, error: "Escreva o que você quer ajustar." };
  if (t.length > 2000) return { ok: false, error: "Mensagem longa demais — resuma em até 2.000 caracteres." };
  try {
    const r = await conversarSobrePost({ postagemId, usuarioId: user.id, texto: t });
    if (r.mudou) revalidar(postagemId);
    return { ok: true, ...r };
  } catch (e) {
    return erro(e, "O assistente não conseguiu responder agora.");
  }
}

/** Áudio gravado no painel do assistente (comando de voz, pedido de 2026-10-21): devolve o texto falado. */
export async function transcreverAudioAction(formData: FormData): Promise<Resultado<{ texto: string }>> {
  await requireModulo("marketing");
  const audio = formData.get("audio");
  if (!(audio instanceof File) || audio.size === 0) return { ok: false, error: "Não chegou áudio nenhum." };
  if (audio.size > 4 * 1024 * 1024) return { ok: false, error: "Áudio longo demais — fale em até 1 minuto." };
  try {
    const texto = (await transcreverAudio(Buffer.from(await audio.arrayBuffer()), audio.type || "audio/webm")).trim();
    return texto ? { ok: true, texto } : { ok: false, error: "Não entendi o áudio — fale de novo, mais perto do microfone." };
  } catch (e) {
    return erro(e, "Não consegui transcrever o áudio.");
  }
}

/** Slides do carrossel com 1 ou 2 fotos cada — a capa e o story ficam como estão. */
export async function trocarFotosPorSlideAction(postagemId: string, porSlide: 1 | 2): Promise<Resultado<{ slides: number; foraDoCarrossel: number }>> {
  await requireModulo("marketing");
  try {
    const r = await trocarFotosPorSlide(postagemId, porSlide === 1 ? 1 : 2);
    revalidar(postagemId);
    return { ok: true, ...r };
  } catch (e) {
    return erro(e, "Não consegui refazer os slides.");
  }
}
