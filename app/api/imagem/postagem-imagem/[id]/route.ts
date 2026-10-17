import { requireApiOuSessaoUser } from "@/lib/auth/api-token";
import { buscarFotoDoPost } from "@/lib/server/marketing";

// Foto de um post como entra nas artes (a tratada) — usada pela prévia do
// editor. Só pra quem está logado.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiOuSessaoUser(request);
  } catch (naoAutenticado) {
    return naoAutenticado as Response;
  }

  const { id } = await params;
  const foto = await buscarFotoDoPost(id);
  if (!foto) {
    return Response.json({ error: "Imagem não encontrada." }, { status: 404 });
  }

  return new Response(new Uint8Array(foto.buffer), {
    headers: {
      "Content-Type": foto.mime,
      // A foto de um id nunca muda.
      "Cache-Control": "private, max-age=86400",
    },
  });
}
