import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { proto, aesEncryptGCM, hmacSign } from "@whiskeysockets/baileys";
import { enviarEnquete, lerVoto } from "./enquetes.js";

// Cifra um voto do jeito que o celular cifra (inverso de decryptPollVote do Baileys).
function cifrarVoto({ segredo, pollMsgId, criador, votante, opcao }) {
  const sign = Buffer.concat([Buffer.from(pollMsgId), Buffer.from(criador), Buffer.from(votante), Buffer.from("Poll Vote"), new Uint8Array([1])]);
  const key0 = hmacSign(segredo, new Uint8Array(32), "sha256");
  const chave = hmacSign(sign, key0, "sha256");
  const iv = randomBytes(12);
  const conteudo = proto.Message.PollVoteMessage.encode({
    selectedOptions: opcao ? [createHash("sha256").update(opcao).digest()] : [],
  }).finish();
  return { encPayload: aesEncryptGCM(conteudo, chave, iv, Buffer.from(`${pollMsgId}\u0000${votante}`)), encIv: iv };
}

function sockFalso() {
  const enviadas = [];
  return {
    user: { id: "555599603257:12@s.whatsapp.net", lid: "98765432101234:12@lid" },
    enviadas,
    async sendMessage(jid, conteudo) {
      enviadas.push({ jid, conteudo });
      return { key: { id: `ENQ${enviadas.length}`, remoteJid: jid, fromMe: true } };
    },
  };
}

const OPCOES = ["✅ Confirmar", "🏗️ É de um negócio", "❌ Descartar"];

test("voto de outra pessoa (endereçada por LID, telefone no Alt) é decifrado", async () => {
  const sock = sockFalso();
  const enviada = await enviarEnquete(sock, "11122233344455@lid", { pergunta: "Confirmar?", opcoes: OPCOES, ref: "despesa:abc" });
  const { poll } = sock.enviadas[0].conteudo;
  assert.equal(poll.selectableCount, 1);
  assert.deepEqual(poll.values, OPCOES);

  // O celular cifrou usando o LID de quem criou e o telefone de quem votou.
  const vote = cifrarVoto({ segredo: poll.messageSecret, pollMsgId: enviada.key.id, criador: "98765432101234@lid", votante: "555591234567@s.whatsapp.net", opcao: "✅ Confirmar" });
  const msg = {
    key: { id: "VOTO1", fromMe: false, remoteJid: "11122233344455@lid", remoteJidAlt: "555591234567@s.whatsapp.net" },
    message: { pollUpdateMessage: { pollCreationMessageKey: { id: enviada.key.id }, vote } },
  };
  assert.deepEqual(lerVoto(sock, msg), { ref: "despesa:abc", opcao: "✅ Confirmar" });
});

test("voto no próprio 'Mensagens para mim' (fromMe) é decifrado", async () => {
  const sock = sockFalso();
  const enviada = await enviarEnquete(sock, "98765432101234@lid", { pergunta: "Confirmar?", opcoes: OPCOES, ref: "despesa:xyz" });
  const segredo = sock.enviadas[0].conteudo.poll.messageSecret;
  const vote = cifrarVoto({ segredo, pollMsgId: enviada.key.id, criador: "555599603257@s.whatsapp.net", votante: "555599603257@s.whatsapp.net", opcao: "❌ Descartar" });
  const msg = { key: { id: "VOTO2", fromMe: true, remoteJid: "98765432101234@lid" }, message: { pollUpdateMessage: { pollCreationMessageKey: { id: enviada.key.id }, vote } } };
  assert.deepEqual(lerVoto(sock, msg), { ref: "despesa:xyz", opcao: "❌ Descartar" });
});

test("voto retirado, enquete desconhecida, chave errada e mensagem comum", async () => {
  const sock = sockFalso();
  const enviada = await enviarEnquete(sock, "11122233344455@lid", { pergunta: "Confirmar?", opcoes: OPCOES, ref: "despesa:abc" });
  const segredo = sock.enviadas[0].conteudo.poll.messageSecret;
  const chave = { id: "V", fromMe: false, remoteJid: "555591234567@s.whatsapp.net" };

  const retirado = cifrarVoto({ segredo, pollMsgId: enviada.key.id, criador: "555599603257@s.whatsapp.net", votante: "555591234567@s.whatsapp.net", opcao: null });
  assert.deepEqual(lerVoto(sock, { key: chave, message: { pollUpdateMessage: { pollCreationMessageKey: { id: enviada.key.id }, vote: retirado } } }), { ref: "despesa:abc", opcao: null });

  assert.deepEqual(lerVoto(sock, { key: chave, message: { pollUpdateMessage: { pollCreationMessageKey: { id: "OUTRA" }, vote: retirado } } }), { desconhecida: true });

  const errado = cifrarVoto({ segredo: randomBytes(32), pollMsgId: enviada.key.id, criador: "555599603257@s.whatsapp.net", votante: "555591234567@s.whatsapp.net", opcao: "✅ Confirmar" });
  assert.deepEqual(lerVoto(sock, { key: chave, message: { pollUpdateMessage: { pollCreationMessageKey: { id: enviada.key.id }, vote: errado } } }), { indecifravel: true });

  assert.equal(lerVoto(sock, { key: chave, message: { conversation: "sim" } }), null);
});
