import "server-only";
import sharp from "sharp";

// Edição de foto por IA (pedido do Marcos de 2026-10-26: "permita a edição de
// itens das imagens, mas somente quando solicitado por mim" — ex.: trocar a
// terra por grama em volta dos brinquedos recém-instalados). A logo e a
// marca nunca passam por aqui: só a foto. Quem chama confere que foi o
// Marcos (administrador) que pediu; a foto original continua guardada
// (PostagemImagem.imagemOriginal) e dá pra voltar a ela.
//
// Modelo: gpt-image-2 — no teste com a foto das gangorras do post #40 trocou
// a terra por grama com a mesma textura do gramado e manteve os brinquedos
// iguais; o gpt-image-1.5 deixou a grama com cara de outro gramado. Leva
// ~1 min por foto: roda em segundo plano (after) e avisa no Telegram.

const MODELO = "gpt-image-2";
const API = "https://api.openai.com/v1/images/edits";

/** O que vai junto de todo pedido: o pedido do Marcos muda só o que ele pediu. */
export function promptDaEdicao(instrucao: string): string {
  return `Edit this real photo of playground equipment delivered and installed by a toy factory (Legaus Kids). Requested change (in Portuguese): "${instrucao.trim()}".
Apply ONLY the requested change, photorealistically, matching the original lighting, colors, texture and perspective.
Keep EVERYTHING else exactly as in the original photo: every playground toy/equipment (slides, swings, seesaws, arches, ladders, houses, rubber floors) with its exact shape, colors, parts, position, size and bases; the buildings, walls, windows, people, trees, sky and the camera framing. Never add, remove, move or restyle any toy or product. Do not add text, logos or watermarks. Do not change the image proportions.`;
}

/**
 * Edita a foto e devolve um JPEG do MESMO tamanho. O modelo só trabalha em
 * 3:2 ou 2:3: a foto vai no meio de uma tela nesse formato (sobras com a
 * própria foto desfocada, pra não distorcer) e volta recortada.
 */
export async function editarFotoComIA(foto: Buffer, instrucao: string): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("A edição por IA não está configurada (falta OPENAI_API_KEY).");
  const meta = await sharp(foto).metadata();
  const W = meta.width ?? 1;
  const H = meta.height ?? 1;
  const paisagem = W >= H;
  const CW = paisagem ? 1536 : 1024;
  const CH = paisagem ? 1024 : 1536;
  const s = Math.min(CW / W, CH / H);
  const fw = Math.round(W * s);
  const fh = Math.round(H * s);
  const ox = Math.round((CW - fw) / 2);
  const oy = Math.round((CH - fh) / 2);
  const fundo = await sharp(foto).resize(CW, CH, { fit: "cover" }).blur(30).toBuffer();
  const tela = await sharp(fundo)
    .composite([{ input: await sharp(foto).resize(fw, fh).toBuffer(), left: ox, top: oy }])
    .png()
    .toBuffer();

  const form = new FormData();
  form.append("model", MODELO);
  form.append("prompt", promptDaEdicao(instrucao));
  form.append("image", new Blob([new Uint8Array(tela)], { type: "image/png" }), "foto.png");
  form.append("size", `${CW}x${CH}`);
  form.append("quality", "high");
  let resposta: Response;
  try {
    resposta = await fetch(API, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form });
  } catch {
    throw new Error("Falha de rede ao falar com a IA de imagem — tente de novo.");
  }
  const json = (await resposta.json().catch(() => null)) as { data?: { b64_json?: string }[]; error?: { message?: string } } | null;
  const b64 = json?.data?.[0]?.b64_json;
  if (!resposta.ok || !b64) throw new Error(`A IA de imagem não editou a foto (${json?.error?.message?.slice(0, 200) ?? `HTTP ${resposta.status}`}).`);

  const editada = Buffer.from(b64, "base64");
  const m = await sharp(editada).metadata();
  const sx = (m.width ?? CW) / CW;
  const sy = (m.height ?? CH) / CH;
  return sharp(editada)
    .extract({ left: Math.round(ox * sx), top: Math.round(oy * sy), width: Math.round(fw * sx), height: Math.round(fh * sy) })
    .resize(W, H)
    .jpeg({ quality: 92 })
    .toBuffer();
}
