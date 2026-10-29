import "server-only";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import caminhoFfmpeg from "ffmpeg-static";
import { DURACAO_TRECHO_S } from "@/lib/utils/musicas-story";

// ffmpeg (pacote ffmpeg-static) pras músicas dos stories (pedido de
// 2026-10-29): corta o trecho da música e monta o vídeo do story (arte +
// música). O binário (~80 MB) só vai no pacote das duas rotas que importam
// este arquivo — ver next.config.ts. Não importar de página nem de action.

let binarioPronto: Promise<string> | null = null;

async function executavel(caminho: string): Promise<boolean> {
  try {
    await fs.access(caminho, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function binario(): Promise<string> {
  binarioPronto ??= (async () => {
    const origem = caminhoFfmpeg;
    if (!origem) throw new Error("O ffmpeg não está disponível neste servidor.");
    if (await executavel(origem)) return origem;
    // Na Vercel o arquivo pode chegar sem permissão de execução: usa uma cópia no /tmp.
    const copia = path.join(os.tmpdir(), "ffmpeg-legaus");
    if (!(await executavel(copia))) {
      await fs.copyFile(origem, copia);
      await fs.chmod(copia, 0o755);
    }
    return copia;
  })().catch((e) => {
    binarioPronto = null;
    throw e;
  });
  return binarioPronto;
}

/** Roda o ffmpeg numa pasta temporária: grava as entradas, executa e devolve o arquivo de saída. */
async function rodarFfmpeg(entradas: Record<string, Buffer>, args: string[], saida: string, prazoMs = 90_000): Promise<Buffer> {
  const pasta = await fs.mkdtemp(path.join(os.tmpdir(), "legaus-ffmpeg-"));
  try {
    for (const [nome, conteudo] of Object.entries(entradas)) await fs.writeFile(path.join(pasta, nome), conteudo);
    const bin = await binario();
    await new Promise<void>((ok, falha) => {
      const proc = spawn(bin, ["-hide_banner", "-loglevel", "error", "-y", ...args], { cwd: pasta });
      let erros = "";
      proc.stderr.on("data", (d) => {
        erros = (erros + d).slice(-4000);
      });
      const relogio = setTimeout(() => {
        proc.kill("SIGKILL");
        falha(new Error("O ffmpeg demorou demais."));
      }, prazoMs);
      proc.on("error", (e) => {
        clearTimeout(relogio);
        falha(e);
      });
      proc.on("close", (codigo) => {
        clearTimeout(relogio);
        if (codigo === 0) ok();
        else falha(new Error(`ffmpeg saiu com código ${codigo}: ${erros.trim().split("\n").slice(-2).join(" | ")}`));
      });
    });
    return await fs.readFile(path.join(pasta, saida));
  } finally {
    await fs.rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}

const AUDIO_AAC = ["-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2"];

/** Trecho que veio do navegador (WAV já cortado) → AAC (.m4a) com fade de entrada e de saída. */
export function codificarTrechoMusica(wav: Buffer, duracaoSeg: number): Promise<Buffer> {
  const duracao = Math.min(duracaoSeg, DURACAO_TRECHO_S);
  const fadeSaida = Math.min(1.5, duracao / 3);
  return rodarFfmpeg(
    { "trecho.wav": wav },
    [
      "-i", "trecho.wav",
      "-t", duracao.toFixed(2),
      "-af", `afade=t=in:st=0:d=0.3,afade=t=out:st=${(duracao - fadeSaida).toFixed(2)}:d=${fadeSaida.toFixed(2)}`,
      ...AUDIO_AAC,
      "-movflags", "+faststart",
      "trecho.m4a",
    ],
    "trecho.m4a",
  );
}

/**
 * Vídeo do story: a arte (JPEG 1080×1920) parada durante o trecho da música.
 * No formato que o Instagram pede pra story: MP4, H.264 4:2:0, 30 fps, GOP
 * fechado, AAC 44,1 kHz, índice no começo (faststart).
 */
export function montarVideoStory(arte: Buffer, musica: Buffer, duracaoSeg: number): Promise<Buffer> {
  return rodarFfmpeg(
    { "arte.jpg": arte, "musica.m4a": musica },
    [
      "-loop", "1", "-framerate", "30", "-i", "arte.jpg",
      "-i", "musica.m4a",
      "-map", "0:v", "-map", "1:a",
      "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=white,format=yuv420p",
      "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage", "-crf", "23", "-profile:v", "high", "-level", "4.1",
      "-r", "30", "-g", "150", "-flags", "+cgop",
      "-c:a", "copy",
      "-t", Math.min(duracaoSeg, DURACAO_TRECHO_S).toFixed(2),
      "-movflags", "+faststart",
      "story.mp4",
    ],
    "story.mp4",
    120_000,
  );
}
