import { requireApiOuSessaoUser } from "@/lib/auth/api-token";
import { assinaturaConfere } from "@/lib/server/cripto";
import { FINALIDADE_VIDEO } from "@/lib/server/meta-publicacao";
import { respostaDeMidia } from "@/lib/server/resposta-midia";
import { videoDaArte } from "@/lib/server/story-video";

// Vídeo do story com música (arte + trecho) por link TEMPORÁRIO e assinado
// (2 h), como o JPEG em /api/imagem/arte-publica: a Meta baixa daqui na
// publicação, e a tela do post usa pra prévia (quem está logado também abre
// sem o link, pra prévia não morrer com a tela aberta). Monta na primeira vez
// (ffmpeg, alguns segundos) e guarda.
export const maxDuration = 120;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";
  const valido = Number.isFinite(exp) && exp * 1000 > Date.now() && assinaturaConfere(`${id}.${exp}`, sig, FINALIDADE_VIDEO);
  if (!valido) {
    try {
      await requireApiOuSessaoUser(request);
    } catch {
      return new Response("Não encontrado.", { status: 404 });
    }
  }
  try {
    const video = await videoDaArte(id);
    if (!video) return new Response("Não encontrado.", { status: 404 });
    return respostaDeMidia(request, video, "video/mp4");
  } catch (e) {
    console.error(`[story-video] arte ${id}: ${e instanceof Error ? e.message : e}`);
    return new Response("Não consegui montar o vídeo.", { status: 500 });
  }
}
