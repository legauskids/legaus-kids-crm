import { requireApiOuSessaoUser } from "@/lib/auth/api-token";
import { gerarPdfApresentacao } from "@/lib/server/apresentacao";

// PDF da apresentação do orçamento (16:9). ?ver=1 abre no navegador (prévia
// do editor); sem ele baixa — igual ao PDF do orçamento. O WhatsApp busca
// por aqui também (Bearer), por isso o mesmo esquema de autenticação.
export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiOuSessaoUser(request);
  } catch (naoAutenticado) {
    return naoAutenticado as Response;
  }

  const { id } = await params;
  const ver = new URL(request.url).searchParams.get("ver") === "1";

  try {
    const { buffer, nomeArquivo } = await gerarPdfApresentacao(id);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${ver ? "inline" : "attachment"}; filename="${nomeArquivo}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (erro) {
    return Response.json({ error: erro instanceof Error ? erro.message : "Falha ao gerar a apresentação." }, { status: 500 });
  }
}
