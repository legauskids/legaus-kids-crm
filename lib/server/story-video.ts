import "server-only";
import { prisma } from "@/lib/db";
import { montarVideoStory } from "@/lib/server/ffmpeg";
import { imagemDaArte } from "@/lib/server/marketing";

// Vídeo do story com música (pedido de 2026-10-29): a arte parada durante o
// trecho da música escolhida no post. Montado na primeira vez que é pedido
// (prévia na tela do post ou a Meta baixando na publicação) e guardado em
// PostagemArteVideo; mudou a arte ou a música, é refeito. Só a rota do vídeo
// importa este arquivo (o ffmpeg vai só no pacote dela).

export async function videoDaArte(arteId: string): Promise<Buffer | null> {
  const arte = await prisma.postagemArte.findUnique({
    where: { id: arteId },
    select: { formato: true, postagem: { select: { musica: { select: { id: true, audio: true, duracaoSeg: true } } } }, video: { select: { chave: true } } },
  });
  const musica = arte?.postagem.musica;
  if (!arte || arte.formato !== "STORY" || !musica) return null;

  const imagem = await imagemDaArte(arteId);
  if (!imagem) return null;
  // A versão da arte é a do desenho (renderizadaEm): o atualizadoEm muda até quando o próprio desenho é guardado.
  const versao = await prisma.postagemArte.findUniqueOrThrow({ where: { id: arteId }, select: { renderizadaEm: true, atualizadoEm: true } });
  const chave = `${(versao.renderizadaEm ?? versao.atualizadoEm).getTime()}|${musica.id}`;
  if (arte.video?.chave === chave) {
    const guardado = await prisma.postagemArteVideo.findUnique({ where: { arteId }, select: { video: true } });
    if (guardado) return Buffer.from(guardado.video);
  }

  const video = await montarVideoStory(imagem.buffer, Buffer.from(musica.audio), musica.duracaoSeg);
  const bytes = new Uint8Array(video);
  await prisma.postagemArteVideo.upsert({ where: { arteId }, create: { arteId, chave, video: bytes }, update: { chave, video: bytes, criadoEm: new Date() } });
  return video;
}
