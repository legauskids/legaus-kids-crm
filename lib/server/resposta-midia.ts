import { faixaPedida } from "@/lib/utils/musicas-story";

/**
 * Resposta de áudio/vídeo que atende pedido por pedaços (Range → 206): o
 * Safari do iPhone não toca a mídia sem isso.
 */
export function respostaDeMidia(request: Request, conteudo: Buffer, tipo: string): Response {
  const total = conteudo.length;
  const faixa = faixaPedida(request.headers.get("range"), total);
  if (faixa === "invalida") return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
  const base = { "Content-Type": tipo, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=600" };
  if (!faixa) return new Response(new Uint8Array(conteudo), { headers: { ...base, "Content-Length": String(total) } });
  const parte = conteudo.subarray(faixa.inicio, faixa.fim + 1);
  return new Response(new Uint8Array(parte), {
    status: 206,
    headers: { ...base, "Content-Length": String(parte.length), "Content-Range": `bytes ${faixa.inicio}-${faixa.fim}/${total}` },
  });
}
