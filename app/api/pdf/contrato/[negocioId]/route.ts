import { requireApiOuSessaoUser } from "@/lib/auth/api-token";
import { gerarPdfContrato } from "@/lib/server/pdf/contrato-pdf";

export async function GET(request: Request, { params }: { params: Promise<{ negocioId: string }> }) {
  try {
    await requireApiOuSessaoUser(request);
  } catch (naoAutenticado) {
    return naoAutenticado as Response;
  }

  const { negocioId } = await params;

  try {
    const { buffer, nomeArquivo } = await gerarPdfContrato(negocioId);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${nomeArquivo}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (erro) {
    return Response.json({ error: erro instanceof Error ? erro.message : "Falha ao gerar PDF." }, { status: 500 });
  }
}
