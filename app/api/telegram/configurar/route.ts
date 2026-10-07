import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { URL_BASE } from "@/lib/constants/app";
import { chamarTelegram, idsAutorizadosTelegram, segredoWebhook, telegramConfigurado } from "@/lib/server/telegram";

/**
 * Liga o bot ao CRM: registra o webhook no Telegram com o segredo derivado
 * do token e mostra o estado. Só administrador logado no navegador; abrir de
 * novo é seguro (registra o mesmo endereço). O token fica só nas variáveis
 * da Vercel — nunca passa por aqui nem pelo servidor da Legaus.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Só administrador." }, { status: 403 });
  if (!telegramConfigurado()) {
    return NextResponse.json({ error: "Falta TELEGRAM_BOT_TOKEN nas variáveis de ambiente da Vercel (e um novo deploy depois de salvar)." }, { status: 503 });
  }

  try {
    const bot = await chamarTelegram<{ username: string }>("getMe");
    await chamarTelegram("setWebhook", {
      url: `${URL_BASE}/api/telegram/webhook`,
      secret_token: segredoWebhook(),
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    });
    const info = await chamarTelegram<{ url: string; pending_update_count: number; last_error_message?: string }>("getWebhookInfo");
    const ligados = await prisma.user.findMany({ where: { telegramId: { not: null } }, select: { username: true } });
    return NextResponse.json({
      ok: true,
      bot: `@${bot.username}`,
      webhook: info.url,
      pendentes: info.pending_update_count,
      ultimoErro: info.last_error_message ?? null,
      idsAutorizados: idsAutorizadosTelegram().size,
      usuariosLigados: ligados.map((u) => u.username),
    });
  } catch (erro) {
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Falha ao falar com o Telegram." }, { status: 502 });
  }
}
