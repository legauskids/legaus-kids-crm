import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { chamarApi } from "./crm-api.js";
import { registrarMapeamento, resolverTelefonePorLid } from "./lid-cache.js";
import { foiEnviadoPeloRelay } from "./ids-relay.js";

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

// Mesma resolução de LID que relay-entrada.js já faz (ver o comentário
// detalhado lá) — sem isso, qualquer mensagem endereçada por LID em vez de
// telefone puro (comum em self-chat e cada vez mais comum em geral) nunca
// batia com WHATSAPP_COMANDO_TELEFONES e o comando era ignorado em
// silêncio, mesmo vindo de um número autorizado de verdade.
function extrairTelefoneRemetente(key) {
  if (key?.senderPn && key?.senderLid) registrarMapeamento(key.senderLid, key.senderPn);
  if (key?.participantPn && key?.participantLid) registrarMapeamento(key.participantLid, key.participantPn);

  const jid = key?.senderPn || key?.remoteJid;
  if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") return null;

  if (jid.endsWith("@lid")) {
    const resolvido = resolverTelefonePorLid(jid);
    if (!resolvido) {
      console.warn(`[relay-comando-agente] LID ${jid} ainda não tem telefone real conhecido — não dá pra checar autorização, ignorando como comando.`);
      return null;
    }
    return resolvido;
  }

  return jid.split("@")[0];
}

// Palavra-gatilho alternativa: manter WHATSAPP_COMANDO_TELEFONES em dia com
// o número exato de cada dispositivo do Marcos/Dani é frágil (o número
// pessoal que ele passou de cabeça tinha um dígito errado — o de verdade só
// apareceu no log). Digitar/começar a mensagem com "agente" funciona
// independente de qual número mandou, então não trava de novo por causa de
// número desatualizado ou dispositivo novo. Só vale pra mensagem RECEBIDA
// (fromMe:false) — nunca pro sentido "Legaus Kids -> alguém", senão o
// Marcos mencionar a palavra "agente" numa conversa de verdade com um
// CLIENTE (ex: "vou perguntar pro nosso agente de vendas") viraria comando
// por engano.
const PALAVRA_GATILHO = /\bagente\b/i;

function autorizado(telefone, { fromMe, texto }) {
  if (TELEFONES_AUTORIZADOS.has(telefone)) return true;
  if (!fromMe && texto && PALAVRA_GATILHO.test(texto)) return true;
  return false;
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
        // A própria resposta automática do agente pra um número autorizado
        // (ex: o Marcos) aparece aqui de novo via sync do WhatsApp
        // (fromMe:true, mesmo remoteJid) — sem esse filtro ela seria
        // reprocessada como um comando novo, o agente responderia de novo,
        // essa resposta ecoaria de novo, e por aí vai (loop infinito visto
        // ao vivo em 2026-09-05 com "Até mais!" se repetindo sem parar).
        if (msg.key.fromMe && foiEnviadoPeloRelay(msg.key.id)) continue;

        const telefone = extrairTelefoneRemetente(msg.key);
        if (!telefone) continue;

        const audioMessage = msg.message?.audioMessage;
        const documentMessage = msg.message?.documentMessage;
        const imageMessage = msg.message?.imageMessage;
        const ehPdf = documentMessage?.mimetype === "application/pdf";
        const texto =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          documentMessage?.caption ||
          imageMessage?.caption ||
          null;

        // Nota de voz não passa pela palavra-gatilho (não dá pra checar o
        // texto sem transcrever antes) — continua só por número autorizado.
        const podeSerGatilho = !audioMessage;
        if (!autorizado(telefone, { fromMe: !!msg.key.fromMe, texto: podeSerGatilho ? texto : null })) continue;

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
        } else if (imageMessage) {
          console.log(`[relay-comando-agente] Imagem de comando recebida (${telefone}), baixando...`);
          const buffer = await downloadMediaMessage(msg, "buffer", {});
          const resultado = await chamarApi("/api/agente/comando-whatsapp", {
            method: "POST",
            body: JSON.stringify({
              telefone,
              texto: texto || undefined,
              anexoImagem: { base64: buffer.toString("base64"), mimetype: imageMessage.mimetype || "image/jpeg" },
            }),
          });
          console.log(`[relay-comando-agente] Comando (imagem) processado -> ${resultado.resposta}`);
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
