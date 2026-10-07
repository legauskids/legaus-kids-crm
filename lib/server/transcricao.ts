import "server-only";
import { prisma } from "@/lib/db";

export function transcricaoConfigurada(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

// Modelo de transcrição da OpenAI. Padrão gpt-4o-mini-transcribe (decisão do
// Marcos em 2026-10-07: metade do preço do whisper-1 e erra menos em
// português); dá pra trocar sem deploy de código pela variável
// TRANSCRICAO_MODELO. Se o modelo escolhido falhar, tenta o whisper-1.
const MODELO_PADRAO = "gpt-4o-mini-transcribe";
const MODELO_RESERVA = "whisper-1";

// Viés de vocabulário pro modelo acertar termos e jargões do negócio que ele
// erraria por padrão (ex: transcrever "PL010" como "P L zero dez").
const VOCABULARIO =
  "Legaus Kids, playground, parque infantil, kidplay, orçamento, negócio, PL-010, PL-018, Apromes, WhatsApp, lista de preços, markup, etapa, funil, " +
  "despesa, combustível, posto, madeireira, categoria, centro de custo, Veículos, Produção, Instalação, Administrativo, Marketing, reais.";

// Nomes dos negócios mais recentes também entram no vocabulário — no 2º
// teste do Marcos (2026-10-07) "Kidplay Ijuí" virou "KidPlay e julho" e o
// negócio não foi encontrado. Vai no fim do prompt (o whisper-1 só usa o
// final) e fica em memória por 10 min pra não consultar o banco a cada áudio.
const MAX_NEGOCIOS_VOCABULARIO = 15;
let negociosEmCache: { nomes: string[]; em: number } | null = null;

async function nomesDeNegociosRecentes(): Promise<string[]> {
  if (negociosEmCache && Date.now() - negociosEmCache.em < 10 * 60 * 1000) return negociosEmCache.nomes;
  try {
    const negocios = await prisma.negocio.findMany({ select: { titulo: true }, orderBy: { updatedAt: "desc" }, take: MAX_NEGOCIOS_VOCABULARIO });
    negociosEmCache = { nomes: negocios.map((n) => n.titulo), em: Date.now() };
    return negociosEmCache.nomes;
  } catch {
    return [];
  }
}

async function transcreverCom(modelo: string, audio: Buffer, mimetype: string, apiKey: string, vocabulario: string): Promise<string> {
  const extensao = mimetype.includes("ogg")
    ? "ogg"
    : mimetype.includes("mp4")
      ? "m4a"
      : mimetype.includes("wav")
        ? "wav"
        : mimetype.includes("mpeg")
          ? "mp3"
          : "webm";
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: mimetype }), `audio.${extensao}`);
  form.append("model", modelo);
  form.append("language", "pt");
  form.append("prompt", vocabulario);

  const resposta = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(`Falha ao transcrever áudio com ${modelo} (${resposta.status}): ${corpo || "erro desconhecido"}`);
  }

  const dados = (await resposta.json()) as { text?: string };
  return (dados.text || "").trim();
}

/** Transcreve um áudio (buffer + mimetype) pra texto em português. */
export async function transcreverAudio(audio: Buffer, mimetype: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Transcrição de voz não configurada — falta OPENAI_API_KEY no ambiente.");
  }

  const modelo = process.env.TRANSCRICAO_MODELO?.trim() || MODELO_PADRAO;
  const negocios = await nomesDeNegociosRecentes();
  const vocabulario = negocios.length ? `${VOCABULARIO} Negócios: ${negocios.join(", ")}.` : VOCABULARIO;
  try {
    return await transcreverCom(modelo, audio, mimetype, apiKey, vocabulario);
  } catch (erro) {
    if (modelo === MODELO_RESERVA) throw erro;
    console.warn(`[transcricao] ${erro instanceof Error ? erro.message : erro} — tentando ${MODELO_RESERVA}.`);
    return transcreverCom(MODELO_RESERVA, audio, mimetype, apiKey, vocabulario);
  }
}
