import { requireApiOuSessaoUser } from "@/lib/auth/api-token";
import { gerarPdfProdutos } from "@/lib/server/pdf/produto-pdf";

/**
 * Vários produtos num PDF só, um por página, na ordem de ?ids=a,b,c
 * (?ocultarValor=1 tira os preços). Serve o navegador logado e o
 * whatsapp-service (Bearer), que baixa o arquivo pra mandar.
 */
export async function GET(request: Request) {
  try {
    await requireApiOuSessaoUser(request);
  } catch (naoAutenticado) {
    return naoAutenticado as Response;
  }

  const url = new URL(request.url);
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const ocultarValor = url.searchParams.get("ocultarValor") === "1";

  try {
    const { buffer, nomeArquivo } = await gerarPdfProdutos(ids, {
      ocultarValor,
    });
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (erro) {
    return Response.json(
      { error: erro instanceof Error ? erro.message : "Falha ao gerar PDF." },
      { status: 400 },
    );
  }
}
