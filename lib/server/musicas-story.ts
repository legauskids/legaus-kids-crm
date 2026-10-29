import "server-only";
import { prisma } from "@/lib/db";

// Biblioteca de músicas dos stories que o CRM publica (pedido de 2026-10-29).
// Sem ffmpeg aqui de propósito (o trecho é codificado na rota de envio —
// lib/server/ffmpeg.ts), pra o binário não entrar no pacote das páginas.

const NAO_PUBLICADO = { notIn: ["PUBLICADO" as const] };

export function listarMusicas() {
  return prisma.musicaStory.findMany({
    orderBy: { criadoEm: "desc" },
    select: {
      id: true,
      titulo: true,
      artista: true,
      fonte: true,
      duracaoSeg: true,
      criadoEm: true,
      _count: { select: { postagens: { where: { status: NAO_PUBLICADO } } } },
    },
  });
}

/** Pra escolher a música na tela do post. */
export function opcoesDeMusica() {
  return prisma.musicaStory.findMany({ orderBy: { titulo: "asc" }, select: { id: true, titulo: true, artista: true } });
}

export async function audioDaMusica(id: string): Promise<Buffer | null> {
  const m = await prisma.musicaStory.findUnique({ where: { id }, select: { audio: true } });
  return m ? Buffer.from(m.audio) : null;
}

/** Exclui a música. Se algum post ainda não publicado usa ela, recusa (o que foi aprovado é o que sai). */
export async function excluirMusica(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const emUso = await prisma.postagem.findMany({ where: { musicaId: id, status: NAO_PUBLICADO }, select: { numero: true }, orderBy: { numero: "asc" } });
  if (emUso.length) {
    return { ok: false, error: `Essa música está no story do${emUso.length > 1 ? "s posts" : " post"} ${emUso.map((p) => `#${p.numero}`).join(", ")} — troque a música lá antes de excluir.` };
  }
  await prisma.musicaStory.delete({ where: { id } }).catch(() => null);
  return { ok: true };
}

/**
 * Escolhe (ou tira) a música do story do post. Como muda o que vai pro ar,
 * post aprovado/agendado volta pra revisão (mesma regra de mexer nas artes).
 */
export async function escolherMusicaDoPost(postagemId: string, musicaId: string | null): Promise<{ ok: true; voltouPraRevisao: boolean } | { ok: false; error: string }> {
  const post = await prisma.postagem.findUnique({
    where: { id: postagemId },
    select: { status: true, musicaId: true, publicacao: true, artes: { where: { formato: "STORY" }, select: { id: true } } },
  });
  if (!post) return { ok: false, error: "Post não encontrado." };
  if (post.artes.length === 0) return { ok: false, error: "Esse post não tem story." };
  if (post.status === "PUBLICADO" || post.status === "PUBLICANDO") return { ok: false, error: "O post já foi (ou está sendo) publicado." };
  const ig = (post.publicacao as { instagram?: { storyIds?: string[]; storyPeloCelularEm?: string } } | null)?.instagram;
  if (ig?.storyPeloCelularEm || ig?.storyIds?.length) return { ok: false, error: "O story desse post já foi publicado." };
  if (musicaId && !(await prisma.musicaStory.findUnique({ where: { id: musicaId }, select: { id: true } }))) {
    return { ok: false, error: "Essa música não existe mais — recarregue a página." };
  }
  if (post.musicaId === musicaId) return { ok: true, voltouPraRevisao: false };
  const voltouPraRevisao = post.status === "APROVADO" || post.status === "AGENDADO";
  await prisma.postagem.update({
    where: { id: postagemId },
    data: { musicaId, ...(voltouPraRevisao && { status: "AGUARDANDO_APROVACAO" as const, agendadaPara: null }) },
  });
  return { ok: true, voltouPraRevisao };
}
