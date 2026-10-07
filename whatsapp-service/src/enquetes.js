import { randomBytes, createHash } from "node:crypto";
import { decryptPollVote, jidNormalizedUser } from "@whiskeysockets/baileys";

// Enquete do WhatsApp como "botão" (pedido de 2026-10-07: confirmar despesa
// tocando, sem digitar "1"). Botões de verdade não funcionam de forma
// confiável em conta comum pelo Baileys; enquete funciona em qualquer
// celular. O CRM manda { pergunta, opcoes, ref } junto da mensagem na fila
// (Mensagem.enquete) e recebe o voto em /api/agente/enquete com o ref.
//
// O voto chega CRIPTOGRAFADO com a chave (messageSecret) da enquete. No
// Baileys 7.0.0-rc14 a decifragem automática está comentada no próprio
// código da lib (process-message.js), então quem decifra é este módulo, com
// a chave que nós mesmos geramos ao mandar a enquete.

const VALIDADE_MS = 2 * 60 * 60 * 1000;
const enquetes = new Map(); // id da mensagem da enquete -> { segredo, opcoes, ref, criadaEm }

function limparVencidas() {
  const limite = Date.now() - VALIDADE_MS;
  for (const [id, e] of enquetes) if (e.criadaEm < limite) enquetes.delete(id);
}

/** Manda a enquete (uma escolha só) e guarda a chave pra decifrar os votos. */
export async function enviarEnquete(sock, jid, { pergunta, opcoes, ref }) {
  limparVencidas();
  const segredo = randomBytes(32);
  const enviada = await sock.sendMessage(jid, {
    poll: { name: pergunta, values: opcoes, selectableCount: 1, messageSecret: segredo },
  });
  if (enviada?.key?.id) enquetes.set(enviada.key.id, { segredo, opcoes, ref, criadaEm: Date.now() });
  return enviada;
}

function semRepetir(lista) {
  return [...new Set(lista.filter(Boolean).map((j) => jidNormalizedUser(j)))];
}

/**
 * Voto de uma mensagem recebida, ou null se não for voto. Devolve
 * { ref, opcao } (opcao null = a pessoa tirou o voto), { desconhecida: true }
 * se a enquete não é desta execução do serviço (reiniciou no meio) ou
 * { indecifravel: true }.
 *
 * A chave de decifragem depende do JID de quem criou e de quem votou, e com
 * os LIDs do WhatsApp cada um pode estar como telefone ou como LID — tenta
 * as combinações (a errada falha na checagem do AES-GCM, sem risco de ler
 * voto errado).
 */
export function lerVoto(sock, msg) {
  const atualizacao = msg.message?.pollUpdateMessage;
  if (!atualizacao) return null;
  const chaveEnquete = atualizacao.pollCreationMessageKey;
  const enquete = enquetes.get(chaveEnquete?.id);
  if (!enquete) return { desconhecida: true };

  const eu = semRepetir([sock.user?.id, sock.user?.lid]);
  const votantes = msg.key.fromMe ? eu : semRepetir([msg.key.participant, msg.key.remoteJid, msg.key.participantAlt, msg.key.remoteJidAlt]);
  for (const criador of eu) {
    for (const votante of votantes) {
      try {
        const voto = decryptPollVote(atualizacao.vote, {
          pollEncKey: enquete.segredo,
          pollCreatorJid: criador,
          pollMsgId: chaveEnquete.id,
          voterJid: votante,
        });
        const escolhidas = (voto.selectedOptions || []).map((h) => Buffer.from(h));
        const opcao = enquete.opcoes.find((o) => escolhidas.some((h) => h.equals(createHash("sha256").update(o).digest()))) ?? null;
        return { ref: enquete.ref, opcao };
      } catch {
        // combinação errada de JIDs — tenta a próxima.
      }
    }
  }
  return { indecifravel: true };
}
