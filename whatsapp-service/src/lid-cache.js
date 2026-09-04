import fs from "node:fs";

const ARQUIVO_CACHE = "lid-cache.json";

/**
 * WhatsApp às vezes identifica um contato por "LID" (Linked ID, um número
 * interno de privacidade) em vez do telefone real — isso acontece de forma
 * inconsistente: às vezes só no remoteJid de mensagens ENVIADAS (onde
 * `key.senderPn` não ajuda, porque resolve o REMETENTE — que já somos nós
 * mesmos — não o destinatário), às vezes até em mensagens recebidas de
 * verdade. Visto ao vivo em 2026-09-03/04: isso criava "contatos" no CRM
 * com um número de 15 dígitos sem sentido em vez do telefone real, e
 * mensagens mandadas pra esse "telefone" fantasma nunca chegavam de
 * verdade a lugar nenhum.
 *
 * O Baileys mantém, nos eventos `contacts.*`, um `Contact` com `lid` e
 * `jid` (telefone) preenchidos juntos quando ele já sabe a correspondência
 * (normalmente vindo da sincronização de contatos do celular). Esse
 * arquivo guarda essa correspondência à parte (persistida em disco, pra
 * sobreviver a reinícios do processo) e permite resolver LID -> telefone
 * de forma confiável nas duas direções de mensagem, em vez de só
 * mensagem recebida.
 */
function carregar() {
  try {
    if (fs.existsSync(ARQUIVO_CACHE)) {
      return new Map(Object.entries(JSON.parse(fs.readFileSync(ARQUIVO_CACHE, "utf8"))));
    }
  } catch (erro) {
    console.error("[lid-cache] Falha ao carregar cache do disco:", erro.message);
  }
  return new Map();
}

const mapa = carregar();

function salvar() {
  try {
    fs.writeFileSync(ARQUIVO_CACHE, JSON.stringify(Object.fromEntries(mapa), null, 2));
  } catch (erro) {
    console.error("[lid-cache] Falha ao salvar cache no disco:", erro.message);
  }
}

function soDigitos(jidOuTelefone) {
  return String(jidOuTelefone ?? "").split("@")[0].replace(/[^\d]/g, "");
}

/** Registra a correspondência lid -> telefone real (aceita jid completo ou só o telefone). */
export function registrarMapeamento(lid, jidOuTelefoneReal) {
  const lidLimpo = soDigitos(lid);
  const telefone = soDigitos(jidOuTelefoneReal);
  if (!lidLimpo || !telefone || lidLimpo === telefone) return;
  if (mapa.get(lidLimpo) === telefone) return;
  mapa.set(lidLimpo, telefone);
  salvar();
  console.log(`[lid-cache] Aprendido: LID ${lidLimpo} -> telefone ${telefone}`);
}

/** Alimenta o cache a partir de um evento contacts.upsert/contacts.update do Baileys. */
export function aprenderDeContatos(contatos) {
  for (const c of contatos ?? []) {
    if (c?.lid && c?.jid) registrarMapeamento(c.lid, c.jid);
  }
}

/** Resolve um LID pro telefone real, se já tivermos aprendido essa correspondência. */
export function resolverTelefonePorLid(lid) {
  return mapa.get(soDigitos(lid)) ?? null;
}

/** Direção contrária — telefone -> LID, usado por relay-saida.js pra mandar mensagem pelo identificador que o WhatsApp espera de verdade. */
export function resolverLidPorTelefone(telefone) {
  const alvo = soDigitos(telefone);
  for (const [lid, tel] of mapa.entries()) {
    if (tel === alvo) return lid;
  }
  return null;
}
