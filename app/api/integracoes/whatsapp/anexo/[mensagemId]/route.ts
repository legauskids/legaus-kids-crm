import { requireUser } from "@/lib/auth/guards";
import { buscarAnexoDaMensagem } from "@/lib/server/conversas";

// Autenticado de propósito (diferente de /api/imagem/produto/[id] e
// /api/imagem/produto-card/[id], que são públicos por natureza) — um anexo
// recebido do WhatsApp pode ser documento/foto do cliente, dado interno do
// CRM, não deve ficar acessível sem login.
export async function GET(_request: Request, { params }: { params: Promise<{ mensagemId: string }> }) {
  await requireUser();
  const { mensagemId } = await params;
  const anexo = await buscarAnexoDaMensagem(mensagemId);
  if (!anexo || !anexo.anexoBytes) {
    return Response.json({ error: "Anexo não encontrado." }, { status: 404 });
  }

  return new Response(new Uint8Array(anexo.anexoBytes), {
    headers: {
      "Content-Type": anexo.anexoMimetype ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${anexo.anexoNome ?? "arquivo"}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
