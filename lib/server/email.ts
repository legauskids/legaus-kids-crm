import "server-only";

const RESEND_API_URL = "https://api.resend.com/emails";

export function emailConfigurado(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Envia e-mail via Resend (API HTTP simples, sem SDK). Lança erro claro se
 * RESEND_API_KEY não estiver configurada — quem chama decide como mostrar
 * isso pro usuário.
 */
export async function enviarEmail(input: {
  para: string;
  assunto: string;
  html: string;
  textoAlternativo: string;
  anexos?: { nomeArquivo: string; conteudo: Buffer }[];
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Envio de e-mail não configurado — falta RESEND_API_KEY no ambiente.");
  }

  const resposta = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || "Legaus Kids <onboarding@resend.dev>",
      to: [input.para],
      subject: input.assunto,
      html: input.html,
      text: input.textoAlternativo,
      attachments: input.anexos?.map((a) => ({ filename: a.nomeArquivo, content: a.conteudo.toString("base64") })),
    }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(`Falha ao enviar e-mail (${resposta.status}): ${corpo || "erro desconhecido"}`);
  }
}
