import { requireApiOuSessaoUser } from "@/lib/auth/api-token";
import { audioDaMusica } from "@/lib/server/musicas-story";
import { respostaDeMidia } from "@/lib/server/resposta-midia";

// Trecho de uma música dos stories (AAC), pra ouvir na biblioteca. Só logado.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiOuSessaoUser(request);
  } catch (naoAutenticado) {
    return naoAutenticado as Response;
  }
  const { id } = await params;
  const audio = await audioDaMusica(id);
  if (!audio) return Response.json({ error: "Música não encontrada." }, { status: 404 });
  return respostaDeMidia(request, audio, "audio/mp4");
}
