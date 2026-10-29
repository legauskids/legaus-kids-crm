// Músicas dos stories que o CRM publica (pedido de 2026-10-29) — regras puras,
// usadas no navegador (cortar o trecho) e no servidor (conferir e montar o vídeo).

/** Trecho de música = duração do vídeo do story (o Instagram aceita de 3 a 60 s). */
export const DURACAO_TRECHO_S = 15;
export const DURACAO_MINIMA_S = 3;
export const TAXA_AMOSTRAGEM = 44100;
/** WAV de 15 s estéreo 16 bits = ~2,6 MB: cabe no limite de 4,5 MB por envio da Vercel. */
export const TAMANHO_MAXIMO_TRECHO = 4 * 1024 * 1024;

/** Onde o trecho pode começar (segundos): de 0 até a duração menos o trecho. */
export function inicioMaximo(duracaoSeg: number): number {
  return Math.max(0, Math.floor(duracaoSeg - DURACAO_TRECHO_S));
}

export function mmss(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** WAV PCM 16 bits a partir dos canais (amostras Float32 de -1 a 1, todos do mesmo tamanho). */
export function codificarWav(canais: Float32Array[], taxa: number): Uint8Array {
  const n = canais[0]?.length ?? 0;
  const bytesDados = n * canais.length * 2;
  const buffer = new ArrayBuffer(44 + bytesDados);
  const v = new DataView(buffer);
  const texto = (pos: number, s: string) => [...s].forEach((c, i) => v.setUint8(pos + i, c.charCodeAt(0)));
  texto(0, "RIFF");
  v.setUint32(4, 36 + bytesDados, true);
  texto(8, "WAVE");
  texto(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, canais.length, true);
  v.setUint32(24, taxa, true);
  v.setUint32(28, taxa * canais.length * 2, true);
  v.setUint16(32, canais.length * 2, true);
  v.setUint16(34, 16, true);
  texto(36, "data");
  v.setUint32(40, bytesDados, true);
  let pos = 44;
  for (let i = 0; i < n; i++) {
    for (const canal of canais) {
      const amostra = Math.max(-1, Math.min(1, canal[i]));
      v.setInt16(pos, amostra < 0 ? amostra * 0x8000 : amostra * 0x7fff, true);
      pos += 2;
    }
  }
  return new Uint8Array(buffer);
}

/** Duração (s) de um WAV PCM, lendo os blocos "fmt " e "data"; null se não for WAV. */
export function duracaoDoWav(bytes: Uint8Array): number | null {
  if (bytes.length < 12) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const texto = (pos: number) => String.fromCharCode(...bytes.subarray(pos, pos + 4));
  if (texto(0) !== "RIFF" || texto(8) !== "WAVE") return null;
  let bytesPorSegundo = 0;
  for (let pos = 12; pos + 8 <= bytes.length; ) {
    const id = texto(pos);
    const tamanho = v.getUint32(pos + 4, true);
    if (id === "fmt " && pos + 20 <= bytes.length) bytesPorSegundo = v.getUint32(pos + 16, true);
    if (id === "data") return bytesPorSegundo > 0 ? Math.min(tamanho, bytes.length - pos - 8) / bytesPorSegundo : null;
    pos += 8 + tamanho + (tamanho % 2);
  }
  return null;
}

/**
 * Pedaço pedido num cabeçalho Range ("bytes=0-1023", "bytes=500-",
 * "bytes=-200"). null = arquivo inteiro; "invalida" = responder 416. O Safari
 * só toca vídeo/áudio se o servidor responder por pedaços.
 */
export function faixaPedida(range: string | null, tamanho: number): { inicio: number; fim: number } | null | "invalida" {
  if (!range) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m || (!m[1] && !m[2]) || tamanho === 0) return "invalida";
  let inicio: number;
  let fim: number;
  if (!m[1]) {
    inicio = Math.max(0, tamanho - Number(m[2]));
    fim = tamanho - 1;
  } else {
    inicio = Number(m[1]);
    fim = m[2] ? Math.min(Number(m[2]), tamanho - 1) : tamanho - 1;
  }
  if (inicio >= tamanho || inicio > fim) return "invalida";
  return { inicio, fim };
}
