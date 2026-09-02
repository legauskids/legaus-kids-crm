import { buscarFotoProduto } from "@/lib/server/produtos";

// Sem autenticação de propósito — essa imagem precisa aparecer no orçamento
// público (sem login) e no corpo do e-mail de orçamento (cliente externo).
// Fotos de produto não são dado sensível.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const foto = await buscarFotoProduto(id);
  if (!foto || !foto.imagemBytes) {
    return Response.json({ error: "Foto não encontrada." }, { status: 404 });
  }

  return new Response(new Uint8Array(foto.imagemBytes), {
    headers: {
      "Content-Type": foto.imagemMime ?? "image/jpeg",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
