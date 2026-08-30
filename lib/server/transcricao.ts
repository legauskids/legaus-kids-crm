import "server-only";

export function transcricaoConfigurada(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** Transcreve um áudio (buffer + mimetype) pra texto via Whisper (OpenAI). */
export async function transcreverAudio(audio: Buffer, mimetype: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Transcrição de voz não configurada — falta OPENAI_API_KEY no ambiente.");
  }

  const extensao = mimetype.includes("ogg") ? "ogg" : mimetype.includes("mp4") ? "m4a" : "webm";
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: mimetype }), `audio.${extensao}`);
  form.append("model", "whisper-1");
  form.append("language", "pt");
  // Viés de vocabulário pro Whisper acertar termos e jargões do negócio que
  // ele erraria por padrão (ex: transcrever "PL010" como "P L zero dez").
  form.append(
    "prompt",
    "Legaus Kids, playground, parque infantil, kidplay, orçamento, negócio, PL-010, PL-018, Apromes, WhatsApp, lista de preços, markup, etapa, funil.",
  );

  const resposta = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(`Falha ao transcrever áudio (${resposta.status}): ${corpo || "erro desconhecido"}`);
  }

  const dados = (await resposta.json()) as { text?: string };
  return (dados.text || "").trim();
}
