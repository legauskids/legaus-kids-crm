import { codificarWav, DURACAO_MINIMA_S, DURACAO_TRECHO_S, TAXA_AMOSTRAGEM } from "@/lib/utils/musicas-story";

// Corta no navegador o trecho da música escolhida (pedido de 2026-10-29): a
// música inteira passa fácil dos 4,5 MB que a Vercel aceita por envio; o
// trecho de 15 s em WAV fica em ~2,6 MB. O servidor transforma em AAC.

type JanelaComWebkit = Window & { webkitAudioContext?: typeof AudioContext };

export async function duracaoDoArquivo(arquivo: File): Promise<number> {
  return (await decodificar(arquivo)).duration;
}

async function decodificar(arquivo: File): Promise<AudioBuffer> {
  const Contexto = window.AudioContext ?? (window as JanelaComWebkit).webkitAudioContext;
  if (!Contexto) throw new Error("Este navegador não consegue abrir áudio — use o Chrome ou o Safari.");
  const ctx = new Contexto();
  try {
    return await ctx.decodeAudioData(await arquivo.arrayBuffer());
  } catch {
    throw new Error("Não consegui abrir esse arquivo de música (use MP3, M4A ou WAV).");
  } finally {
    void ctx.close();
  }
}

/** Trecho de até 15 s a partir de `inicioSeg`, em WAV estéreo 44,1 kHz. */
export async function cortarTrecho(arquivo: File, inicioSeg: number): Promise<Blob> {
  const original = await decodificar(arquivo);
  const duracao = Math.min(DURACAO_TRECHO_S, original.duration - inicioSeg);
  if (duracao < DURACAO_MINIMA_S) throw new Error(`O trecho tem que ter pelo menos ${DURACAO_MINIMA_S} segundos — comece antes.`);
  const offline = new OfflineAudioContext(2, Math.round(duracao * TAXA_AMOSTRAGEM), TAXA_AMOSTRAGEM);
  const fonte = offline.createBufferSource();
  fonte.buffer = original;
  fonte.connect(offline.destination);
  fonte.start(0, inicioSeg, duracao);
  const trecho = await offline.startRendering();
  const wav = codificarWav([trecho.getChannelData(0), trecho.getChannelData(1)], TAXA_AMOSTRAGEM);
  return new Blob([wav.buffer as ArrayBuffer], { type: "audio/wav" });
}
