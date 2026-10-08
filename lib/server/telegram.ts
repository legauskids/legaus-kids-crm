import "server-only";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { processarBotaoAgente, processarComandoAgente } from "@/lib/server/agente";
import { importarExtratoDaMensagem } from "@/lib/server/conciliacao-bancaria";
import { transcreverAudio } from "@/lib/server/transcricao";
import { agenteLigado, dividirMensagem, paraHtmlTelegram, type Botoes } from "@/lib/utils/agente-canal";
import { idsAutorizados, lerUpdate, type UpdateLido } from "@/lib/utils/telegram";

// Canal do Telegram exclusivo do Marcos (pedido de 2026-10-07). Recebe por
// webhook na Vercel (decisão do Marcos: continua funcionando com o servidor
// da Legaus fora do ar) — ver app/api/telegram/. Só responde a quem está em
// TELEGRAM_ALLOWED_IDS E ligado a um usuário do CRM (User.telegramId);
// qualquer outro ID é ignorado em silêncio e fica registrado.
//
// Este arquivo é só o ADAPTADOR: baixa o que veio (áudio, foto, PDF,
// extrato), entrega pro núcleo do agente (lib/server/agente.ts) e desenha a
// resposta (HTML + botões). Nenhuma regra de negócio mora aqui.
//
// O token (TELEGRAM_BOT_TOKEN) nunca vai pra log nem pra mensagem de erro:
// ele faz parte da URL da API do Telegram.

const API_TELEGRAM = "https://api.telegram.org";
/** Bots só baixam arquivo de até 20 MB pela API do Telegram. */
const LIMITE_ARQUIVO = 20 * 1024 * 1024;

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

/** Resposta do núcleo desenhada no Telegram: HTML, quebrada se for longa, botões na última parte. */
export async function enviarRespostaTelegram(chatId: string, resposta: { mensagem: string; botoes?: Botoes }): Promise<void> {
  const partes = dividirMensagem(resposta.mensagem.trim() || "Feito.");
  for (let i = 0; i < partes.length; i++) {
    const botoes = i === partes.length - 1 ? resposta.botoes : undefined;
    const teclado = botoes?.length ? { inline_keyboard: botoes.map((linha) => linha.map((b) => ({ text: b.texto, callback_data: b.dados }))) } : undefined;
    try {
      await chamarTelegram("sendMessage", {
        chat_id: chatId,
        text: paraHtmlTelegram(partes[i]),
        parse_mode: "HTML",
        reply_markup: teclado,
        link_preview_options: { is_disabled: true },
      });
    } catch (erro) {
      // Marcação que o Telegram não aceitou: vai sem formatação.
      if (!(erro instanceof Error && /parse entities/i.test(erro.message))) throw erro;
      await chamarTelegram("sendMessage", { chat_id: chatId, text: partes[i], reply_markup: teclado });
    }
  }
}

async function baixarArquivoTelegram(fileId: string): Promise<Buffer> {
  const info = await chamarTelegram<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!info.file_path) throw new Error("o Telegram não devolveu o arquivo");
  let r: Response;
  try {
    r = await fetch(`${API_TELEGRAM}/file/bot${tokenDoBot()}/${info.file_path}`);
  } catch {
    throw new Error("falha de rede ao baixar o arquivo do Telegram");
  }
  if (!r.ok) throw new Error(`o Telegram respondeu HTTP ${r.status} ao baixar o arquivo`);
  return Buffer.from(await r.arrayBuffer());
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

function textoDeAjuda(nome: string): string {
  return [
    `Olá, ${nome}! 👋 Sou o agente do CRM da Legaus Kids, aqui no seu Telegram privado — ninguém mais vê esta conversa.`,
    "",
    "Pode falar por texto ou áudio, do mesmo jeito que no WhatsApp:",
    "• *Despesas*: \"gastei 250 no posto Ipiranga\", ou a foto/PDF do comprovante — confirmo com botões.",
    "• *Extrato*: mande o arquivo .ofx do banco que eu importo pra conciliação.",
    "• *CRM*: tarefas, negócios, clientes, orçamentos e resumos (\"o que tenho hoje?\").",
    "",
    "Ações que mandam algo pra cliente ou apagam dados pedem confirmação antes.",
  ].join("\n");
}

type Usuario = { id: string; nome: string };
type Resposta = { mensagem: string; botoes?: Botoes };

/**
 * O que fazer com o update de quem está autorizado. `gravado` = o núcleo
 * já registrou o resultado no ComandoAgente do update (comandoId).
 */
async function responderUpdate(u: UpdateLido, usuario: Usuario, identificador: string, comandoId: string): Promise<{ resposta: Resposta | null; gravado: boolean }> {
  if (u.tipo === "botao") {
    // Tira o teclado da mensagem tocada antes de tudo: dois toques seguidos
    // não fazem a mesma coisa duas vezes.
    if (u.mensagemId) {
      await chamarTelegram("editMessageReplyMarkup", { chat_id: u.chatId, message_id: u.mensagemId, reply_markup: { inline_keyboard: [] } }).catch(() => {});
    }
    const r = await processarBotaoAgente({ identificador, usuarioId: usuario.id, dados: u.texto ?? "" });
    return { resposta: r ? { mensagem: r.resposta, botoes: r.botoes } : { mensagem: "Esse botão não vale mais — me diga por texto o que precisa." }, gravado: false };
  }

  const texto = u.texto?.trim() ?? "";
  if (/^\/(start|ajuda|help)\b/i.test(texto)) return { resposta: { mensagem: textoDeAjuda(usuario.nome) }, gravado: false };

  if (u.tipo === "outro" || (u.tipo === "texto" && !texto)) {
    return { resposta: { mensagem: "Por enquanto eu entendo texto, áudio, foto e documento (PDF ou extrato .ofx)." }, gravado: false };
  }

  await chamarTelegram("sendChatAction", { chat_id: u.chatId, action: "typing" }).catch(() => {});
  const base = { origem: "TELEGRAM" as const, identificador, usuarioId: usuario.id, comandoId };

  if (u.arquivo && (u.arquivo.tamanho ?? 0) > LIMITE_ARQUIVO) {
    return { resposta: { mensagem: "Esse arquivo passa de 20 MB, o limite do Telegram pra bots — mande uma versão menor." }, gravado: false };
  }
  const bytes = u.arquivo ? await baixarArquivoTelegram(u.arquivo.fileId) : null;

  if (u.tipo === "audio" && bytes) {
    const mime = u.arquivo?.mime ?? "audio/ogg";
    const transcricao = await transcreverAudio(bytes, mime);
    if (!transcricao) return { resposta: { mensagem: "Não consegui entender o áudio — pode mandar de novo ou escrever?" }, gravado: false };
    const r = await processarComandoAgente({ ...base, texto: transcricao, anexoAudio: { base64: bytes.toString("base64"), mimetype: mime } });
    return { resposta: { mensagem: r.resposta, botoes: r.botoes }, gravado: true };
  }

  if (u.tipo === "foto" && bytes) {
    const r = await processarComandoAgente({
      ...base,
      texto: texto || "Segue a imagem anexada.",
      anexoImagem: { base64: bytes.toString("base64"), mimetype: u.arquivo?.mime ?? "image/jpeg" },
    });
    return { resposta: { mensagem: r.resposta, botoes: r.botoes }, gravado: true };
  }

  if (u.tipo === "documento" && bytes && u.arquivo) {
    const nome = u.arquivo.nome ?? "arquivo";
    if (nome.toLowerCase().endsWith(".ofx")) {
      return { resposta: { mensagem: await importarExtratoDaMensagem({ nomeArquivo: nome, bytes, usuarioId: usuario.id }) }, gravado: false };
    }
    const ehPdf = u.arquivo.mime === "application/pdf" || nome.toLowerCase().endsWith(".pdf");
    const r = await processarComandoAgente({
      ...base,
      texto: texto || (ehPdf ? "Segue o PDF anexado." : "Segue o arquivo anexado."),
      ...(ehPdf
        ? { anexoPdf: { base64: bytes.toString("base64"), nomeArquivo: nome } }
        : { anexoArquivo: { base64: bytes.toString("base64"), nomeArquivo: nome, mimetype: u.arquivo.mime ?? "application/octet-stream" } }),
    });
    return { resposta: { mensagem: r.resposta, botoes: r.botoes }, gravado: true };
  }

  const r = await processarComandoAgente({ ...base, texto: texto.replace(/^\//, "") });
  return { resposta: { mensagem: r.resposta, botoes: r.botoes }, gravado: true };
}

/** Um update do webhook: confere quem é, registra (sem duplicar), processa e responde. */
export async function processarUpdateTelegram(bruto: unknown): Promise<void> {
  const u = lerUpdate(bruto);
  if (!u) return;

  if (!u.chatPrivado) return registrarIgnorado(u, "fora de conversa privada");
  if (!idsAutorizadosTelegram().has(u.fromId)) return registrarIgnorado(u, "ID não autorizado");

  const usuario = await prisma.user.findUnique({ where: { telegramId: u.fromId }, select: { id: true, nome: true, canaisAgente: true } });
  const identificador = `tg:${u.fromId}`;
  const recebido = u.tipo === "botao" ? `[botão: ${u.botaoTexto ?? u.texto}]` : (u.texto ?? `[${u.tipo}]`);

  let comandoId: string;
  try {
    const comando = await prisma.comandoAgente.create({
      data: {
        origem: "TELEGRAM",
        identificador,
        usuarioId: usuario?.id,
        // Provisório até o núcleo gravar o texto de verdade (não conta como
        // repetição na proteção contra loop).
        textoComando: `[recebendo ${u.tipo}]`,
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

  let resposta: Resposta | null;
  let gravado = false;
  try {
    if (!usuario) {
      resposta = { mensagem: "Seu ID está autorizado, mas não está ligado a nenhum usuário do CRM. Peça para um administrador fazer a ligação." };
    } else if (!agenteLigado(usuario.canaisAgente, "telegram")) {
      resposta = { mensagem: "O agente está desligado neste canal. Dá pra religar em Configurações do CRM." };
    } else {
      ({ resposta, gravado } = await responderUpdate(u, usuario, identificador, comandoId));
    }
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "erro desconhecido";
    console.error(`[telegram] falha ao processar ${u.tipo}: ${motivo}`);
    resposta = { mensagem: `Não consegui processar isso agora (${motivo}). Tenta de novo daqui a pouco.` };
    gravado = false;
  }

  let falhaEnvio: string | null = null;
  if (resposta) {
    try {
      await enviarRespostaTelegram(u.chatId, resposta);
    } catch (erro) {
      falhaEnvio = erro instanceof Error ? erro.message : "erro desconhecido";
      console.error(`[telegram] falha ao enviar resposta: ${falhaEnvio}`);
    }
  }

  if (!gravado) {
    await prisma.comandoAgente.update({
      where: { id: comandoId },
      data: { textoComando: recebido, resposta: `${falhaEnvio ? `[falha ao enviar: ${falhaEnvio}] ` : ""}${resposta?.mensagem ?? ""}` },
    });
  } else if (falhaEnvio) {
    const atual = await prisma.comandoAgente.findUnique({ where: { id: comandoId }, select: { resposta: true } });
    await prisma.comandoAgente.update({ where: { id: comandoId }, data: { resposta: `[falha ao enviar: ${falhaEnvio}] ${atual?.resposta ?? ""}` } });
  }
}
