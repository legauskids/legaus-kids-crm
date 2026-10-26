import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import type { AlvoFoto } from "@/lib/utils/postagem-arte";

// Onde estão os brinquedos em cada foto (pedido do Marcos de 2026-10-26:
// "garantir que os brinquedos apareçam na imagem"). O Claude olha a foto e
// devolve a caixa que contém todos os brinquedos; o enquadramento
// (enquadrarNoAlvo, em lib/utils/postagem-arte.ts) usa essa caixa pra
// posicionar a foto — e, se a foto for muito larga pro slide, diminui até
// caber, com fundo desfocado da própria foto.

const MODELO = "claude-sonnet-5";
const LADO = 1024;

const PEDIDO = (w: number, h: number) =>
  `A foto tem ${w}×${h} px (x da esquerda pra direita, y de cima pra baixo). Localize TODOS os brinquedos de playground instalados nela — escorregador, escada, balanço, gangorra, gira-gira, arco, trepa-trepa, casinha, túnel, piso emborrachado com brinquedo etc. (o que a fábrica entregou). Ignore prédio, muro, bancos, árvores, pessoas e carros. Responda SÓ um JSON, sem texto em volta: {"caixa":[x0,y0,x1,y1]} com a menor caixa que contém todos os brinquedos INTEIROS (inclua as pontas, as escadas e as bases no chão), ou {"caixa":null} se não houver brinquedo na foto.`;

/** A caixa dos brinquedos na foto, de 0 a 1 (x0, y0, x1, y1); null = não tem brinquedo ou não deu pra ver. */
export async function localizarBrinquedos(foto: Buffer): Promise<AlvoFoto | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const { data, info } = await sharp(foto).rotate().resize({ width: LADO, height: LADO, fit: "inside" }).jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
  try {
    const resposta = await new Anthropic({ apiKey }).messages.create({
      model: MODELO,
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: data.toString("base64") } },
            { type: "text", text: PEDIDO(info.width, info.height) },
          ],
        },
      ],
    });
    const texto = resposta.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return caixaDaResposta(texto, info.width, info.height);
  } catch (erro) {
    console.error(`[enquadramento] não consegui localizar os brinquedos: ${erro instanceof Error ? erro.message : erro}`);
    return null;
  }
}

/** Lê {"caixa":[x0,y0,x1,y1]} (em pixels da foto enviada) e normaliza pra 0 a 1. */
export function caixaDaResposta(texto: string, w: number, h: number): AlvoFoto | null {
  const json = texto.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  let caixa: unknown;
  try {
    caixa = (JSON.parse(json) as { caixa?: unknown }).caixa;
  } catch {
    return null;
  }
  if (!Array.isArray(caixa) || caixa.length !== 4 || !caixa.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const [x0, y0, x1, y1] = caixa as number[];
  const n = (v: number, max: number) => Math.min(Math.max(v / max, 0), 1);
  const alvo: AlvoFoto = [n(Math.min(x0, x1), w), n(Math.min(y0, y1), h), n(Math.max(x0, x1), w), n(Math.max(y0, y1), h)];
  // Caixa minúscula = resposta estranha: melhor não enquadrar por ela.
  return alvo[2] - alvo[0] < 0.03 || alvo[3] - alvo[1] < 0.03 ? null : alvo;
}
