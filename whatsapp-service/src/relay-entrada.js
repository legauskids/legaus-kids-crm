import { chamarApi } from "./crm-api.js";

/**
 * Extrai o texto de uma mensagem do Baileys. Só cobre mensagem de texto
 * simples (os dois formatos mais comuns) — mesmo escopo que a extensão
 * antiga já tinha (ela só lia `span.selectable-text` no DOM, ou seja,
 * também só texto). Mídia (áudio, imagem, figurinha) fica de fora por
 * enquanto; dá pra ampliar depois se precisar.
 */
function extrairTexto(msg) {
  return msg.message?.conversation || msg.message?.extendedTextMessage?.text || null;
}

function extrairTelefone(remoteJid) {
  if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") return null;
  return remoteJid.split("@")[0];
}

/**
 * Liga o listener de mensagens novas do Baileys e reporta cada uma pro CRM
 * — mesma rota (POST /mensagens) e mesmo formato que extension/background.js
 * (reportarMensagemRecebida) já usava. Essa rota já é idempotente por
 * externalId (ver lib/server/conversas.ts, encontrarMensagemPorExternalId),
 * então uma mensagem que o PRÓPRIO relay-saida.js acabou de mandar (e que
 * também aparece aqui, com fromMe:true) não duplica — só cai como
 * "duplicada: true" e é ignorada.
 */
export function ligarRelayDeEntrada(sock) {
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" && type !== "append") return;

    for (const msg of messages) {
      try {
        const telefone = extrairTelefone(msg.key?.remoteJid);
        const texto = extrairTexto(msg);
        if (!telefone || !texto || !msg.key?.id) continue;

        await chamarApi("/api/integracoes/whatsapp/mensagens", {
          method: "POST",
          body: JSON.stringify({
            telefone,
            texto,
            direcao: msg.key.fromMe ? "SAIDA" : "ENTRADA",
            externalId: msg.key.id,
            enviadaEm: msg.messageTimestamp
              ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
              : undefined,
          }),
        });
      } catch (erro) {
        console.error("[relay-entrada] Falha ao reportar mensagem pro CRM:", erro.message);
      }
    }
  });
}
