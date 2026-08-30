import { requireApiOuSessaoUser } from "@/lib/auth/api-token";
import { gerarPdfOrcamento } from "@/lib/server/pdf/orcamento-pdf";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiOuSessaoUser(request);
  } catch (naoAutenticado) {
    return naoAutenticado as Response;
  }

  const { id } = await params;

  try {
    const { buffer, nomeArquivo } = await gerarPdfOrcamento(id);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        // attachment (não inline): clicar baixa o arquivo em vez de navegar pra
        // ele — evita ficar "preso" sem conseguir voltar (PWA/mobile sem barra
        // de navegador) e evita o navegador reaproveitar uma versão antiga da
        // mesma URL como se fosse a mesma "página" já visitada.
        "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (erro) {
    return Response.json({ error: erro instanceof Error ? erro.message : "Falha ao gerar PDF." }, { status: 500 });
  }
}
