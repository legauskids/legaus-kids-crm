import { downloadMediaMessage, getContentType } from "@whiskeysockets/baileys";
import { chamarApi } from "./crm-api.js";
import { registrarMapeamento, resolverTelefonePorLid } from "./lid-cache.js";

// Limite pensado pro tamanho que a hospedagem do CRM aceita num POST só
// (base64 infla o tamanho em ~33%, e isso tudo vai num único corpo JSON) —
// cobre foto/PDF normal de celular com folga, sem arriscar um vídeo grande
// estourar o limite da rota no meio do caminho.
const TAMANHO_MAXIMO_ANEXO_BYTES = 8 * 1024 * 1024;

/**
 * Extrai o texto de uma mensagem do Baileys — texto simples ou a legenda de
 * uma foto/vídeo/documento (áudio e figurinha não têm legenda no WhatsApp).
 */
function extrairTexto(msg) {
  const m = msg.message;
  return (
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    m?.documentMessage?.caption ||
    null
  );
}

const TIPOS_MIDIA = new Set(["imageMessage", "videoMessage", "documentMessage", "audioMessage", "stickerMessage"]);

/**
 * Baixa e descriptografa a mídia de uma mensagem recebida (o Baileys só
 * entrega uma referência criptografada — o conteúdo de verdade precisa ser
 * baixado do CDN do WhatsApp à parte). Devolve null pra mensagem sem mídia,
 * mídia maior que o limite, ou qualquer falha no download (mídia expirada,
 * por exemplo) — nesses casos o texto, se houver, ainda é reportado
 * normalmente pro CRM, só sem o anexo.
 */
async function extrairMidia(sock, msg) {
  const tipo = getContentType(msg.message);
  if (!tipo || !TIPOS_MIDIA.has(tipo)) return null;

  const conteudo = msg.message[tipo];
  const tamanhoEsperado = Number(conteudo?.fileLength ?? 0);
  if (tamanhoEsperado > TAMANHO_MAXIMO_ANEXO_BYTES) {
    console.warn(`[relay-entrada] Anexo de ${tipo} maior que o limite (${tamanhoEsperado} bytes) — mensagem reportada só com o texto, se tiver.`);
    return null;
  }

  try {
    const buffer = await downloadMediaMessage(msg, "buffer", {}, { reuploadRequest: sock.updateMediaMessage });
    const extensao = (conteudo.mimetype || "").split("/")[1]?.split(";")[0] || "bin";
    return {
      base64: buffer.toString("base64"),
      nome: conteudo.fileName || `${tipo.replace("Message", "")}-${msg.key.id}.${extensao}`,
      mimetype: conteudo.mimetype || "application/octet-stream",
    };
  } catch (erro) {
    console.error(`[relay-entrada] Falha ao baixar mídia (${tipo}) da mensagem ${msg.key.id}:`, erro.message);
    return null;
  }
}

/** Pega o telefone de dentro do vCard (linha "TEL..."), só dígitos — mesmo formato que extrairTelefone já usa pro remetente. */
function extrairTelefoneDoVCard(vcard) {
  const linhaTel = vcard.split(/\r?\n/).find((l) => l.toUpperCase().startsWith("TEL"));
  if (!linhaTel) return null;
  const valor = linhaTel.split(":").pop();
  if (!valor) return null;
  const digitos = valor.replace(/[^\d]/g, "");
  return digitos || null;
}

/**
 * Contato compartilhado no WhatsApp vem como `contactMessage` (um só) ou
 * `contactsArrayMessage` (vários) — v1 só trata o primeiro contato do array,
 * cobre o caso comum de "aqui está o contato do fulano".
 */
function extrairContatoCompartilhado(msg) {
  const contato = msg.message?.contactMessage || msg.message?.contactsArrayMessage?.contacts?.[0];
  if (!contato?.vcard) return null;
  const telefone = extrairTelefoneDoVCard(contato.vcard);
  if (!telefone) return null;
  return { nome: contato.displayName || "Contato sem nome", telefone };
}

/**
 * Contas WhatsApp mais novas às vezes identificam o contato por um "LID"
 * (Linked ID, identificador interno de privacidade que o WhatsApp foi
 * introduzindo aos poucos) em vez do número de telefone real — foi isso
 * que causou mensagens chegando (e sendo mandadas!) com um número sem
 * sentido de 15 dígitos em vez do telefone de verdade (visto ao vivo em
 * 2026-08-24 e de novo em 2026-09-03/04).
 *
 * `key.senderPn` resolve o REMETENTE (`key.senderLid`) — funciona bem pra
 * mensagem recebida (`fromMe: false`), onde o remetente É o contato que
 * importa. Mas pra mensagem ENVIADA por nós (`fromMe: true`), o que
 * importa é o DESTINATÁRIO (`remoteJid`), e `senderPn` não ajuda em nada
 * nesse caso (resolve a nossa própria identidade, que já conhecemos) —
 * foi exatamente esse caso (mandar do WhatsApp da Legaus Kids pro próprio
 * número pessoal) que continuou quebrado mesmo com o fix de 2026-08-24.
 * Por isso, quando `remoteJid` termina em "@lid", usa o cache aprendido
 * em lid-cache.js (alimentado pela sincronização de contatos do Baileys)
 * pra resolver o telefone de verdade nas duas direções.
 *
 * Se nada resolver, devolve null de propósito — em vez de criar um
 * "contato" fantasma com o LID cru como telefone (o que gerava um número
 * inválido pro qual nenhuma mensagem futura conseguia ser entregue).
 */
function extrairTelefone(key) {
  if (key?.senderPn && key?.senderLid) registrarMapeamento(key.senderLid, key.senderPn);
  if (key?.participantPn && key?.participantLid) registrarMapeamento(key.participantLid, key.participantPn);

  const jid = key?.senderPn || key?.remoteJid;
  if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") return null;

  if (jid.endsWith("@lid")) {
    const resolvido = resolverTelefonePorLid(jid);
    if (!resolvido) {
      console.warn(`[relay-entrada] Ignorando mensagem — LID ${jid} ainda não tem telefone real conhecido (sincronização de contatos ainda não chegou a esse contato).`);
      return null;
    }
    return resolvido;
  }

  return jid.split("@")[0];
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
        const telefone = extrairTelefone(msg.key);
        if (!telefone || !msg.key?.id) continue;

        const contatoCompartilhado = extrairContatoCompartilhado(msg);
        const tipoMidia = contatoCompartilhado ? null : getContentType(msg.message);
        const anexo = tipoMidia && TIPOS_MIDIA.has(tipoMidia) ? await extrairMidia(sock, msg) : null;
        // Mensagem só com mídia (sem legenda) ainda precisa de algum texto —
        // usa o nome do anexo baixado, ou um aviso genérico quando a mídia
        // era grande/expirada demais pra baixar (pelo menos o contato não
        // some da fila de atendimento).
        const texto = contatoCompartilhado
          ? `📇 Contato compartilhado: ${contatoCompartilhado.nome} — ${contatoCompartilhado.telefone}`
          : extrairTexto(msg) || (anexo ? `📎 ${anexo.nome}` : tipoMidia ? "📎 Arquivo recebido (não foi possível baixar automaticamente)" : null);
        if (!texto) continue;

        await chamarApi("/api/integracoes/whatsapp/mensagens", {
          method: "POST",
          body: JSON.stringify({
            telefone,
            // Nome que a própria pessoa configurou no perfil dela do
            // WhatsApp — o Baileys já manda isso em toda mensagem recebida
            // (msg.pushName), só usamos em mensagem de entrada porque em
            // mensagens que o próprio usuário do CRM manda (fromMe) o
            // pushName é o nome do Marcos/Dani, não do contato.
            nomeContato: !msg.key.fromMe ? msg.pushName || undefined : undefined,
            texto,
            anexo: anexo || undefined,
            direcao: msg.key.fromMe ? "SAIDA" : "ENTRADA",
            externalId: msg.key.id,
            enviadaEm: msg.messageTimestamp
              ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
              : undefined,
            contatoCompartilhado: contatoCompartilhado || undefined,
          }),
        });
      } catch (erro) {
        console.error("[relay-entrada] Falha ao reportar mensagem pro CRM:", erro.message);
      }
    }
  });
}
