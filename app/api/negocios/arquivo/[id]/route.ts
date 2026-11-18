import { requireApiOuSessaoUser } from "@/lib/auth/api-token";
import { moduloPermitido } from "@/lib/auth/permissoes";
import { getArquivoNegocio, lerParteArquivoNegocio } from "@/lib/server/negocio-arquivos";
import { abreNoNavegador, contentDisposition } from "@/lib/utils/negocio-arquivos";

/**
 * Arquivo anexado ao negócio (pedido de 2026-11-18). Vai em stream, parte por
 * parte: resposta comum acima de ~4,5 MB a Vercel recusa. PDF, imagem, vídeo,
 * áudio e texto abrem no navegador; o resto (e ?baixar=1) baixa.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let usuario;
  try {
    usuario = await requireApiOuSessaoUser(request);
  } catch (naoAutenticado) {
    return naoAutenticado as Response;
  }
  if (!moduloPermitido(usuario, "negocios")) {
    return Response.json({ error: "Sem acesso a Negócios." }, { status: 403 });
  }

  const { id } = await params;
  const arquivo = await getArquivoNegocio(id);
  if (!arquivo) {
    return Response.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }

  let indice = 0;
  const corpo = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (indice >= arquivo.partesTotal) {
        controller.close();
        return;
      }
      const bytes = await lerParteArquivoNegocio(id, indice++);
      if (!bytes) {
        controller.error(new Error(`Parte ${indice - 1} do arquivo ${id} não existe.`));
        return;
      }
      controller.enqueue(new Uint8Array(bytes));
    },
  });

  const inline = abreNoNavegador(arquivo.mime) && !new URL(request.url).searchParams.has("baixar");
  return new Response(corpo, {
    headers: {
      "Content-Type": arquivo.mime,
      "Content-Disposition": contentDisposition(arquivo.nome, inline),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
