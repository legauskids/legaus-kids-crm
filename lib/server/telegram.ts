import "server-only";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { idsAutorizados, lerUpdate, type UpdateLido } from "@/lib/utils/telegram";

// Canal do Telegram exclusivo do Marcos (pedido de 2026-10-07). Recebe por
// webhook na Vercel (decisão do Marcos: continua funcionando com o servidor
// da Legaus fora do ar) — ver app/api/telegram/. Só responde a quem está em
// TELEGRAM_ALLOWED_IDS E ligado a um usuário do CRM (User.telegramId);
// qualquer outro ID é ignorado em silêncio e fica registrado.
//
// O token (TELEGRAM_BOT_TOKEN) nunca vai pra log nem pra mensagem de erro:
// ele faz parte da URL da API do Telegram.

const API_TELEGRAM = "https://api.telegram.org";

function tokenDoBot(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN não configurado.");
  return token;
}

export function telegramConfigurado(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
}

export function idsAutorizadosTelegram(): Set<string> {
  return idsAutorizados(process.env.TELEGRAM_ALLOWED_IDS);
}

/**
 * Segredo que o Telegram manda em todo webhook (header
 * X-Telegram-Bot-Api-Secret-Token). Derivado do token, pra não precisar de
 * outra variável; prova que o update veio do Telegram e não de um curioso
 * que achou o endereço.
 */
export function segredoWebhook(): string {
  return crypto.createHash("sha256").update(`webhook-legaus:${tokenDoBot()}`).digest("hex");
}

export function segredoConfere(recebido: string | null): boolean {
  if (!recebido) return false;
  const esperado = Buffer.from(segredoWebhook());
  const veio = Buffer.from(recebido);
  return veio.length === esperado.length && crypto.timingSafeEqual(veio, esperado);
}

export async function chamarTelegram<T = unknown>(metodo: string, corpo: Record<string, unknown> = {}): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`${API_TELEGRAM}/bot${tokenDoBot()}/${metodo}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
  } catch {
    // O erro original do fetch pode trazer a URL, que tem o token.
    throw new Error(`Telegram ${metodo}: falha de rede`);
  }
  const json = (await resposta.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (!json?.ok) throw new Error(`Telegram ${metodo}: ${json?.description ?? `HTTP ${resposta.status}`}`);
  return json.result as T;
}

export function enviarMensagemTelegram(chatId: string, texto: string) {
  return chamarTelegram("sendMessage", { chat_id: chatId, text: texto });
}

function ehDuplicado(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002";
}

/** ID de fora da lista (ou fora de conversa privada): não responde, só registra quem foi. */
async function registrarIgnorado(u: UpdateLido, motivo: string): Promise<void> {
  console.warn(`[telegram] ignorado (${motivo}): ID ${u.fromId}${u.username ? ` @${u.username}` : ""}, ${u.tipo}.`);
  try {
    await prisma.comandoAgente.create({
      data: {
        origem: "TELEGRAM",
        identificador: `tg:${u.fromId}`,
        // Só quem e o tipo — o conteúdo de quem não é autorizado não é guardado.
        textoComando: `[ignorado: ${motivo}${u.username ? `, @${u.username}` : ""}${u.primeiroNome ? `, ${u.primeiroNome}` : ""}, ${u.tipo}]`,
        status: "CANCELADO",
        externalId: `tg:${u.updateId}`,
      },
    });
  } catch (erro) {
    if (!ehDuplicado(erro)) throw erro;
  }
}

/**
 * Um update do webhook. Etapa 2 do pedido: só confirma a conexão e a
 * restrição por ID — o agente entra na etapa 3.
 */
export async function processarUpdateTelegram(bruto: unknown): Promise<void> {
  const u = lerUpdate(bruto);
  if (!u) return;

  if (!u.chatPrivado) return registrarIgnorado(u, "fora de conversa privada");
  if (!idsAutorizadosTelegram().has(u.fromId)) return registrarIgnorado(u, "ID não autorizado");

  const usuario = await prisma.user.findUnique({ where: { telegramId: u.fromId }, select: { id: true, nome: true, username: true } });

  let comandoId: string;
  try {
    const comando = await prisma.comandoAgente.create({
      data: {
        origem: "TELEGRAM",
        identificador: `tg:${u.fromId}`,
        usuarioId: usuario?.id,
        textoComando: u.texto ?? `[${u.tipo}]`,
        externalId: `tg:${u.updateId}`,
      },
    });
    comandoId = comando.id;
  } catch (erro) {
    // Reenvio do mesmo update pelo Telegram: já foi tratado.
    if (ehDuplicado(erro)) return;
    throw erro;
  }

  if (u.callbackId) await chamarTelegram("answerCallbackQuery", { callback_query_id: u.callbackId }).catch(() => {});

  const resposta = usuario
    ? `Olá, ${usuario.nome}! 👋\nEste Telegram está ligado ao CRM como o usuário "${usuario.username}".\nPor enquanto eu só confirmo a conexão; o agente chega na próxima etapa.`
    : "Seu ID está autorizado, mas não está ligado a nenhum usuário do CRM. Peça para um administrador fazer a ligação.";

  let registrado = resposta;
  try {
    await enviarMensagemTelegram(u.chatId, resposta);
  } catch (erro) {
    registrado = `[falha ao enviar: ${erro instanceof Error ? erro.message : "erro desconhecido"}] ${resposta}`;
    console.error(`[telegram] ${registrado}`);
  }
  await prisma.comandoAgente.update({ where: { id: comandoId }, data: { resposta: registrado } });
}
