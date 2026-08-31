import { requireApiOuSessaoUser } from "@/lib/auth/api-token";
import { buscarVariantePorId } from "@/lib/server/marketing";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiOuSessaoUser(request);
  } catch (naoAutenticado) {
    return naoAutenticado as Response;
  }

  const { id } = await params;
  const variante = await buscarVariantePorId(id);
  if (!variante) {
    return Response.json({ error: "Variante não encontrada." }, { status: 404 });
  }

  return new Response(new Uint8Array(variante.imagem), {
    headers: {
      "Content-Type": variante.imagemMime,
      "Cache-Control": "no-store",
    },
  });
}
