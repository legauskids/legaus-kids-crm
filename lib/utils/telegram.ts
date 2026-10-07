// Canal do Telegram exclusivo do Marcos (pedido de 2026-10-07): as regras
// puras e testáveis — quem pode falar com o bot e o que veio em cada update.
// A parte que fala com o Telegram e com o banco fica em lib/server/telegram.ts.

/** IDs de TELEGRAM_ALLOWED_IDS: só dígitos, separados por vírgula, espaço ou ponto e vírgula. */
export function idsAutorizados(lista: string | undefined | null): Set<string> {
  return new Set(
    (lista ?? "")
      .split(/[\s,;]+/)
      .map((t) => t.trim())
      .filter((t) => /^\d+$/.test(t)),
  );
}

type UsuarioTelegram = { id: number; username?: string; first_name?: string };
type ChatTelegram = { id: number; type: string };
type MensagemTelegram = {
  message_id: number;
  from?: UsuarioTelegram;
  chat: ChatTelegram;
  text?: string;
  caption?: string;
  voice?: unknown;
  audio?: unknown;
  photo?: unknown[];
  document?: { mime_type?: string; file_name?: string };
};
export type UpdateTelegram = {
  update_id: number;
  message?: MensagemTelegram;
  callback_query?: { id: string; from: UsuarioTelegram; message?: { chat: ChatTelegram }; data?: string };
};

export type TipoMensagemTelegram = "texto" | "audio" | "foto" | "documento" | "botao" | "outro";

/** O que importa de um update: quem mandou, de onde e o quê. */
export type UpdateLido = {
  updateId: number;
  fromId: string;
  chatId: string;
  chatPrivado: boolean;
  username: string | null;
  primeiroNome: string | null;
  tipo: TipoMensagemTelegram;
  texto: string | null;
  callbackId: string | null;
};

export function lerUpdate(bruto: unknown): UpdateLido | null {
  const update = bruto as UpdateTelegram | null;
  if (!update || typeof update.update_id !== "number") return null;

  if (update.callback_query) {
    const cb = update.callback_query;
    const chat = cb.message?.chat;
    return {
      updateId: update.update_id,
      fromId: String(cb.from.id),
      chatId: String(chat?.id ?? cb.from.id),
      chatPrivado: !chat || chat.type === "private",
      username: cb.from.username ?? null,
      primeiroNome: cb.from.first_name ?? null,
      tipo: "botao",
      texto: cb.data ?? null,
      callbackId: cb.id,
    };
  }

  const m = update.message;
  if (!m?.from) return null;
  const tipo: TipoMensagemTelegram = m.voice || m.audio ? "audio" : m.photo?.length ? "foto" : m.document ? "documento" : m.text ? "texto" : "outro";
  return {
    updateId: update.update_id,
    fromId: String(m.from.id),
    chatId: String(m.chat.id),
    chatPrivado: m.chat.type === "private",
    username: m.from.username ?? null,
    primeiroNome: m.from.first_name ?? null,
    tipo,
    texto: m.text ?? m.caption ?? null,
    callbackId: null,
  };
}
