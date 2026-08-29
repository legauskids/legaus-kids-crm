import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { chamarApi } from "./crm-api.js";

// Números autorizados a dar comando de voz pro agente (além do próprio
// número da Legaus, que sempre é permitido — ver extrairTelefone/fromMe
// abaixo). Nota de voz de qualquer outro número (ex: cliente perguntando
// algo) é ignorada pelo agente — a mensagem em si continua indo pro
// Atendimento normalmente pelo relay-entrada.js, só não vira comando.
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

function autorizado(msg, telefone) {
  if (msg.key.fromMe) return true;
  return TELEFONES_AUTORIZADOS.has(telefone);
}

/**
 * Detecta nota de voz de um número autorizado, baixa o áudio e manda pro
 * agente do CRM transcrever + executar. A resposta do agente volta pro
 * WhatsApp pela fila de envio normal (o CRM já cuida disso) — esse relay só
 * precisa entregar o áudio, não espera resposta pra mostrar em lugar nenhum.
 */
export function ligarRelayDeComandoDeVoz(sock) {
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" && type !== "append") return;

    for (const msg of messages) {
      try {
        const audioMessage = msg.message?.audioMessage;
        if (!audioMessage) continue;

        const telefone = extrairTelefoneRemetente(msg.key);
        if (!telefone) continue;
        if (!autorizado(msg, telefone)) continue;

        console.log(`[relay-comando-voz] Nota de voz de comando recebida (${telefone}), baixando e transcrevendo...`);
        const buffer = await downloadMediaMessage(msg, "buffer", {});
        const audioBase64 = buffer.toString("base64");

        const resultado = await chamarApi("/api/agente/comando-audio", {
          method: "POST",
          body: JSON.stringify({
            telefone,
            audioBase64,
            mimetype: audioMessage.mimetype || "audio/ogg",
          }),
        });
        console.log(`[relay-comando-voz] Comando processado: "${resultado.transcricao}" -> ${resultado.resposta}`);
      } catch (erro) {
        console.error("[relay-comando-voz] Falha ao processar comando de voz:", erro.message);
      }
    }
  });
}
