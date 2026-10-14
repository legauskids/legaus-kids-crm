import { requireApiOuSessaoUser } from "@/lib/auth/api-token";
import { gerarPdfProduto } from "@/lib/server/pdf/produto-pdf";

/**
 * Ficha do produto em PDF (?ocultarValor=1 tira o preço). Serve tanto o
 * navegador logado quanto o whatsapp-service (Bearer), que baixa o arquivo
 * pra mandar pelo WhatsApp.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiOuSessaoUser(request);
  } catch (naoAutenticado) {
    return naoAutenticado as Response;
  }

  const { id } = await params;
  const ocultarValor = new URL(request.url).searchParams.get("ocultarValor") === "1";

  try {
    const { buffer, nomeArquivo } = await gerarPdfProduto(id, { ocultarValor });
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        // Mesmo motivo do PDF do orçamento: baixar em vez de navegar.
        "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (erro) {
    return Response.json({ error: erro instanceof Error ? erro.message : "Falha ao gerar PDF." }, { status: 500 });
  }
}
