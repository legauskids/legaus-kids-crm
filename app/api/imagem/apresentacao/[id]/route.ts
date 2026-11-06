import { requireApiOuSessaoUser } from "@/lib/auth/api-token";
import { bytesDaImagemApresentacao } from "@/lib/server/apresentacao";

// Imagem extra da apresentação do orçamento, pra miniatura no editor. Com
// login (pode ser foto de obra de outro cliente); o PDF lê direto do banco.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiOuSessaoUser(request);
  } catch (naoAutenticado) {
    return naoAutenticado as Response;
  }

  const { id } = await params;
  const imagem = await bytesDaImagemApresentacao(id);
  if (!imagem) return Response.json({ error: "Imagem não encontrada." }, { status: 404 });

  // A imagem de um id nunca muda (trocar = enviar outra).
  return new Response(new Uint8Array(imagem.bytes), {
    headers: { "Content-Type": imagem.mime, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
