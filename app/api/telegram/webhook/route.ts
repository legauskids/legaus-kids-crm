import { after } from "next/server";
import { processarUpdateTelegram, segredoConfere, telegramConfigurado } from "@/lib/server/telegram";

// Recebe os updates do bot do Telegram (webhook registrado em
// /api/telegram/configurar). Responde 200 na hora e processa depois: o
// Telegram reenvia o update que não recebe 200 a tempo, e o agente pode
// levar dezenas de segundos. Reenvio não duplica (ComandoAgente.externalId).
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!telegramConfigurado()) return new Response("Telegram não configurado", { status: 503 });
  if (!segredoConfere(request.headers.get("x-telegram-bot-api-secret-token"))) {
    console.warn("[telegram] webhook recusado: segredo inválido.");
    return new Response("Proibido", { status: 403 });
  }

  const update = await request.json().catch(() => null);
  after(async () => {
    try {
      await processarUpdateTelegram(update);
    } catch (erro) {
      console.error(`[telegram] falha ao processar update: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
    }
  });
  return new Response("ok");
}
