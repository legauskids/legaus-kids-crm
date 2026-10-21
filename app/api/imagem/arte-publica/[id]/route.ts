import { assinaturaConfere } from "@/lib/server/cripto";
import { imagemDaArte } from "@/lib/server/marketing";
import { FINALIDADE_LINK } from "@/lib/server/meta-publicacao";

// JPEG de uma arte por link público TEMPORÁRIO e assinado (2 h): é daqui que
// a Meta baixa as imagens na hora de publicar (etapa 3, 2026-10-21). Sem a
// assinatura certa ou depois do prazo, 404 — ninguém lista nem adivinha.
export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";
  const valido = Number.isFinite(exp) && exp * 1000 > Date.now() && assinaturaConfere(`${id}.${exp}`, sig, FINALIDADE_LINK);
  if (!valido) return new Response("Não encontrado.", { status: 404 });
  const arte = await imagemDaArte(id);
  if (!arte) return new Response("Não encontrado.", { status: 404 });
  return new Response(new Uint8Array(arte.buffer), {
    headers: { "Content-Type": "image/jpeg", "Content-Length": String(arte.buffer.length), "Cache-Control": "private, max-age=600" },
  });
}
