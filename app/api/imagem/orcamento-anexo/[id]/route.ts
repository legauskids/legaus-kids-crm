import crypto from "node:crypto";
import { requireApiOuSessaoUser } from "@/lib/auth/api-token";
import { bytesDoAnexoOrcamento } from "@/lib/server/anexos-orcamento";

// Imagem anexa ao orçamento: com login (editor e impressão) ou com o token do
// link público do próprio orçamento (?t=), pra quem recebeu o link ver.
// O PDF lê direto do banco.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = new URL(request.url).searchParams.get("t");
  const anexo = await bytesDoAnexoOrcamento(id);

  if (token) {
    if (!anexo?.orcamento.tokenPublico || !iguais(token, anexo.orcamento.tokenPublico)) return new Response("Não encontrado.", { status: 404 });
  } else {
    try {
      await requireApiOuSessaoUser(request);
    } catch (naoAutenticado) {
      return naoAutenticado as Response;
    }
    if (!anexo) return Response.json({ error: "Imagem não encontrada." }, { status: 404 });
  }

  // A imagem de um id nunca muda (trocar = enviar outra).
  return new Response(new Uint8Array(anexo.bytes), {
    headers: { "Content-Type": anexo.mime, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}

function iguais(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
