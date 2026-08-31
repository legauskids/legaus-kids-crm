import { requireApiOuSessaoUser } from "@/lib/auth/api-token";
import { buscarImagemOriginalPorId } from "@/lib/server/marketing";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiOuSessaoUser(request);
  } catch (naoAutenticado) {
    return naoAutenticado as Response;
  }

  const { id } = await params;
  const imagem = await buscarImagemOriginalPorId(id);
  if (!imagem) {
    return Response.json({ error: "Imagem não encontrada." }, { status: 404 });
  }

  return new Response(new Uint8Array(imagem.imagemOriginal), {
    headers: {
      "Content-Type": imagem.imagemOriginalMime,
      "Cache-Control": "no-store",
    },
  });
}
