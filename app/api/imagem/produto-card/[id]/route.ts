import { gerarCardProdutoBuffer } from "@/lib/server/produto-cards";

// Sem autenticação de propósito, mesmo padrão de /api/imagem/produto/[id] —
// o relay do WhatsApp (whatsapp-service) precisa baixar essa imagem pra
// mandar como anexo, sem token de sessão. Não é dado sensível.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ocultarValor = new URL(request.url).searchParams.get("ocultarValor") === "1";
  try {
    const buffer = await gerarCardProdutoBuffer(id, { ocultarValor });
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "Produto não encontrado." }, { status: 404 });
  }
}
