import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { chamarApi } from "./crm-api.js";

// Números autorizados a dar comando (voz, texto ou PDF) pro agente de IA —
// só dígitos, com DDI, ver .env.example. Vale nas duas direções: mensagem
// DE um número da lista PRA Legaus Kids, ou DA Legaus Kids PRO número
// (self-chat, "gravando/digitando e mandando pra si mesmo").
//
// Antes disso checava só `msg.key.fromMe` pro sentido "Legaus -> alguém",
// sem olhar pra quem é esse "alguém" — bug real: isso tratava QUALQUER
// mensagem que o Marcos mandasse do WhatsApp da Legaus Kids pra um CLIENTE
// de verdade como comando pro agente (ex: uma nota de voz respondendo um
// cliente virava "comando", e a resposta do agente ia pro cliente errado,
// não pro Marcos). Corrigido: os dois sentidos passam pelo mesmo
// TELEFONES_AUTORIZADOS, resolvido a partir de quem está do outro lado da
// conversa (`extrairTelefoneRemetente`), nunca só pelo fromMe.
const TELEFONES_AUTORIZADOS = new Set(
  (process.env.WHATSAPP_COMANDO_TELEFONES || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean),
);

function extrairTelefoneRemetente(key) {
  const jid = key?.senderPn || key?.remoteJid;
  if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") return null;
  return jid.split("@")[0];
}

function autorizado(telefone) {
  return TELEFONES_AUTORIZADOS.has(telefone);
}

/**
 * Detecta comando de um número autorizado — nota de voz (transcrita pelo
 * agente), texto puro, ou PDF (com ou sem legenda) — e manda pro agente do
 * CRM processar. A resposta volta pro WhatsApp pela fila de envio normal
 * (o CRM já cuida disso via /api/integracoes/whatsapp/fila-envio) — esse
 * relay só precisa entregar o comando, não espera resposta pra mostrar em
 * lugar nenhum.
 */
export function ligarRelayDeComandoAgente(sock) {
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" && type !== "append") return;

    for (const msg of messages) {
      try {
        const telefone = extrairTelefoneRemetente(msg.key);
        if (!telefone || !autorizado(telefone)) continue;

        const audioMessage = msg.message?.audioMessage;
        const documentMessage = msg.message?.documentMessage;
        const ehPdf = documentMessage?.mimetype === "application/pdf";
        const texto = msg.message?.conversation || msg.message?.extendedTextMessage?.text || documentMessage?.caption || null;

        if (audioMessage) {
          console.log(`[relay-comando-agente] Nota de voz de comando recebida (${telefone}), baixando e transcrevendo...`);
          const buffer = await downloadMediaMessage(msg, "buffer", {});
          const resultado = await chamarApi("/api/agente/comando-audio", {
            method: "POST",
            body: JSON.stringify({ telefone, audioBase64: buffer.toString("base64"), mimetype: audioMessage.mimetype || "audio/ogg" }),
          });
          console.log(`[relay-comando-agente] Comando processado: "${resultado.transcricao}" -> ${resultado.resposta}`);
        } else if (ehPdf) {
          console.log(`[relay-comando-agente] PDF de comando recebido (${telefone}: ${documentMessage.fileName}), baixando...`);
          const buffer = await downloadMediaMessage(msg, "buffer", {});
          const resultado = await chamarApi("/api/agente/comando-whatsapp", {
            method: "POST",
            body: JSON.stringify({
              telefone,
              texto: texto || undefined,
              anexoPdf: { base64: buffer.toString("base64"), nomeArquivo: documentMessage.fileName || "documento.pdf" },
            }),
          });
          console.log(`[relay-comando-agente] Comando (PDF) processado -> ${resultado.resposta}`);
        } else if (texto) {
          console.log(`[relay-comando-agente] Comando de texto recebido (${telefone}): "${texto.slice(0, 60)}"`);
          const resultado = await chamarApi("/api/agente/comando-whatsapp", {
            method: "POST",
            body: JSON.stringify({ telefone, texto }),
          });
          console.log(`[relay-comando-agente] Comando processado -> ${resultado.resposta}`);
        }
      } catch (erro) {
        console.error("[relay-comando-agente] Falha ao processar comando:", erro.message);
      }
    }
  });
}
