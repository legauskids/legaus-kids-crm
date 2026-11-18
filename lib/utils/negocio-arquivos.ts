// Arquivos anexados ao negócio (pedido de 2026-11-18) — contas que valem no
// navegador e no servidor. A Vercel recusa corpo de requisição acima de
// ~4,5 MB, então o arquivo sobe em partes de 3 MB e volta em stream
// (/api/negocios/arquivo/[id]).

export const PARTE_ARQUIVO_NEGOCIO = 3 * 1024 * 1024;
export const TAMANHO_MAXIMO_ARQUIVO_NEGOCIO = 50 * 1024 * 1024;
export const MAX_ARQUIVOS_POR_ENVIO = 10;

export type ArquivoNegocioVM = { id: string; nome: string; mime: string; tamanho: number };

const FALHA_DE_REDE = "Não foi possível enviar agora — confira a internet e tente de novo.";

export function totalDePartes(tamanho: number): number {
  return Math.max(1, Math.ceil(tamanho / PARTE_ARQUIVO_NEGOCIO));
}

/** Tamanho que a parte `indice` tem que ter (a última leva o resto); 0 se o índice não existe. */
export function tamanhoDaParte(tamanho: number, indice: number): number {
  const total = totalDePartes(tamanho);
  if (!Number.isInteger(indice) || indice < 0 || indice >= total) return 0;
  return indice < total - 1 ? PARTE_ARQUIVO_NEGOCIO : tamanho - PARTE_ARQUIVO_NEGOCIO * (total - 1);
}

/** O que impede o arquivo de subir, ou null. */
export function problemaDoArquivo(tamanho: number): string | null {
  if (!Number.isSafeInteger(tamanho) || tamanho <= 0) return "está vazio";
  if (tamanho > TAMANHO_MAXIMO_ARQUIVO_NEGOCIO) return `passa de ${TAMANHO_MAXIMO_ARQUIVO_NEGOCIO / (1024 * 1024)} MB`;
  return null;
}

/** Só o nome (sem pasta nem caractere de controle), com no máximo 200 caracteres e a extensão preservada. */
export function nomeArquivoSeguro(nome: string): string {
  const limpo = (nome.split(/[\\/]/).pop() ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!limpo) return "arquivo";
  if (limpo.length <= 200) return limpo;
  const extensao = /\.[^.\s]{1,10}$/.exec(limpo)?.[0] ?? "";
  return limpo.slice(0, 200 - extensao.length) + extensao;
}

export function mimeSeguro(mime: string): string {
  const m = mime.trim().toLowerCase();
  return m.length <= 120 && /^[a-z0-9][\w.+-]*\/[\w.+-]+$/.test(m) ? m : "application/octet-stream";
}

// Só o que o navegador mostra sem rodar código: HTML e SVG (que podem ter
// script) sempre baixam.
const ABRE_NO_NAVEGADOR =
  /^(application\/pdf|text\/plain|image\/(png|jpeg|gif|webp|avif|bmp)|video\/(mp4|webm|ogg|quicktime)|audio\/(mpeg|mp4|ogg|wav|webm|aac|x-m4a))$/;

export function abreNoNavegador(mime: string): boolean {
  return ABRE_NO_NAVEGADOR.test(mime);
}

export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

/** Content-Disposition com o nome acentuado (filename*) e um reserva só em ASCII. */
export function contentDisposition(nome: string, inline: boolean): string {
  const ascii = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]|["\\]/g, "_");
  const utf8 = encodeURIComponent(nome).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

type Resultado<T> = T | { error: string };

export type EnvioEmPartes = {
  iniciar: (meta: { nome: string; mime: string; tamanho: number }) => Promise<Resultado<{ id: string }>>;
  enviarParte: (id: string, indice: number, parte: Blob) => Promise<Resultado<{ ok: true }>>;
};

/**
 * Sobe um arquivo parte por parte (cada parte tenta 2 vezes se a internet
 * falhar); `progresso` recebe quantos bytes já foram.
 */
export async function enviarEmPartes(arquivo: File, envio: EnvioEmPartes, progresso?: (enviados: number) => void): Promise<Resultado<{ id: string }>> {
  let inicio: Resultado<{ id: string }>;
  try {
    inicio = await envio.iniciar({ nome: arquivo.name, mime: arquivo.type, tamanho: arquivo.size });
  } catch {
    return { error: FALHA_DE_REDE };
  }
  if ("error" in inicio) return inicio;

  const total = totalDePartes(arquivo.size);
  for (let indice = 0; indice < total; indice++) {
    const de = indice * PARTE_ARQUIVO_NEGOCIO;
    const parte = arquivo.slice(de, de + PARTE_ARQUIVO_NEGOCIO);
    let r: Resultado<{ ok: true }> | null = null;
    for (let tentativa = 1; tentativa <= 2 && !r; tentativa++) {
      try {
        r = await envio.enviarParte(inicio.id, indice, parte);
      } catch {
        r = null;
      }
    }
    if (!r) return { error: FALHA_DE_REDE };
    if ("error" in r) return r;
    progresso?.(de + parte.size);
  }
  return { id: inicio.id };
}
