import { requireApiOuSessaoUser } from "@/lib/auth/api-token";
import { gerarPdfContrato } from "@/lib/server/pdf/contrato-pdf";

export async function GET(request: Request, { params }: { params: Promise<{ contratoId: string }> }) {
  try {
    await requireApiOuSessaoUser(request);
  } catch (naoAutenticado) {
    return naoAutenticado as Response;
  }

  const { contratoId } = await params;

  // ?ver=1: abre no navegador (botão "Ver PDF" da tela do contrato) em vez de baixar.
  const disposicao = new URL(request.url).searchParams.get("ver") === "1" ? "inline" : "attachment";

  try {
    const { buffer, nomeArquivo } = await gerarPdfContrato(contratoId);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposicao}; filename="${nomeArquivo}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (erro) {
    return Response.json({ error: erro instanceof Error ? erro.message : "Falha ao gerar PDF." }, { status: 500 });
  }
}
