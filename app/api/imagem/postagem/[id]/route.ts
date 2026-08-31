import { requireApiOuSessaoUser } from "@/lib/auth/api-token";
import { buscarPostagemPorId } from "@/lib/server/marketing";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiOuSessaoUser(request);
  } catch (naoAutenticado) {
    return naoAutenticado as Response;
  }

  const { id } = await params;
  const versao = new URL(request.url).searchParams.get("v") === "original" ? "original" : "editada";

  const postagem = await buscarPostagemPorId(id);
  if (!postagem) {
    return Response.json({ error: "Postagem não encontrada." }, { status: 404 });
  }

  const bytes = versao === "original" ? postagem.imagemOriginal : postagem.imagemEditada;
  const mime = versao === "original" ? postagem.imagemOriginalMime : postagem.imagemEditadaMime;

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "no-store",
    },
  });
}
