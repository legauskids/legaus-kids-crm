import { requireApiOuSessaoUser } from "@/lib/auth/api-token";
import { gerarWordContrato } from "@/lib/server/contrato-docx";

// O contrato em Word (.docx), pra editar fora do CRM. Fica embaixo de
// /api/pdf pra seguir a mesma regra de login do PDF (ver middleware.ts).
export async function GET(request: Request, { params }: { params: Promise<{ contratoId: string }> }) {
  try {
    await requireApiOuSessaoUser(request);
  } catch (naoAutenticado) {
    return naoAutenticado as Response;
  }

  const { contratoId } = await params;

  try {
    const { buffer, nomeArquivo } = await gerarWordContrato(contratoId);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (erro) {
    return Response.json({ error: erro instanceof Error ? erro.message : "Falha ao gerar o Word." }, { status: 500 });
  }
}
