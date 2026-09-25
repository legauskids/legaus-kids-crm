import fs from "node:fs";
import { isLidUser, isPnUser } from "@whiskeysockets/baileys";
import { mesmoTelefone } from "./telefone.js";

const ARQUIVO_CACHE = "lid-cache.json";

/**
 * WhatsApp às vezes identifica um contato por "LID" (Linked ID, um número
 * interno de privacidade) em vez do telefone real — isso acontece de forma
 * inconsistente: às vezes só no remoteJid de mensagens ENVIADAS, às vezes
 * até em mensagens recebidas de verdade. Visto ao vivo em 2026-09-03/04:
 * isso criava "contatos" no CRM com um número de 15 dígitos sem sentido em
 * vez do telefone real, e mensagens mandadas pra esse "telefone" fantasma
 * nunca chegavam de verdade a lugar nenhum.
 *
 * Esse arquivo guarda a correspondência LID -> telefone (persistida em
 * disco, pra sobreviver a reinícios) e resolve o telefone do outro lado da
 * conversa nas duas direções de mensagem. Desde o Baileys 7 (2026-09-25) ele
 * também aprende com o que o próprio WhatsApp informa — o `remoteJidAlt` da
 * mensagem, o evento `lid-mapping.update` e o mapeamento interno do Baileys
 * (`signalRepository.lidMapping`) —, o que resolve o caso de mensagem de
 * contato novo sendo ignorada por "LID ainda sem telefone conhecido".
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

// Só o "usuário" do JID, sem domínio e sem o número do aparelho
// ("262551384379457:2@lid" -> "262551384379457"). Sem tirar o ":2", o
// aparelho virava dígito a mais do LID.
function soDigitos(jidOuTelefone) {
  return String(jidOuTelefone ?? "").split("@")[0].split(":")[0].replace(/[^\d]/g, "");
}

/** Registra a correspondência lid -> telefone real (aceita jid completo ou só o telefone). */
export function registrarMapeamento(lid, jidOuTelefoneReal) {
  const lidLimpo = soDigitos(lid);
  const telefone = soDigitos(jidOuTelefoneReal);
  if (!lidLimpo || !telefone || lidLimpo === telefone) return;
  const atual = mapa.get(lidLimpo);
  if (atual === telefone) return;
  // Mesmo número em outro formato (com/sem o 9 extra — o Baileys 7 sempre
  // devolve o formato interno do WhatsApp, sem o 9): mantém o que já estava.
  // O telefone é o identificador da conversa no CRM e do histórico do
  // agente; trocar de formato no meio partiria os dois.
  if (atual && mesmoTelefone(atual, telefone)) return;
  mapa.set(lidLimpo, telefone);
  salvar();
  console.log(`[lid-cache] Aprendido: LID ${lidLimpo} -> telefone ${telefone}`);
}

/** Alimenta o cache a partir de um evento contacts.upsert/contacts.update do Baileys. */
export function aprenderDeContatos(contatos) {
  for (const c of contatos ?? []) {
    // Baileys 7: `id` é o identificador preferido; `phoneNumber` vem quando o
    // id é LID, e `lid` quando o id é telefone.
    if (c?.id && isLidUser(c.id) && c.phoneNumber) registrarMapeamento(c.id, c.phoneNumber);
    else if (c?.id && isPnUser(c.id) && c.lid) registrarMapeamento(c.lid, c.id);
    // Formato do Baileys 6 (lid + jid), por garantia.
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

/**
 * Telefone (só dígitos) de quem está do OUTRO lado da conversa de uma
 * mensagem — o contato, nas duas direções (recebida ou mandada por nós).
 * Devolve null pra grupo, status, canal, ou LID que ninguém conseguiu
 * resolver (de propósito: melhor ignorar do que criar um contato fantasma
 * com o LID cru como telefone).
 */
export async function resolverTelefoneDaConversa(sock, key) {
  const jid = key?.remoteJid;
  if (!jid || !(isLidUser(jid) || isPnUser(jid))) return null;

  // Baileys 7: remoteJidAlt é o "outro formato" do remetente (telefone se a
  // mensagem veio por LID, e vice-versa). Numa mensagem mandada por nós de
  // outro aparelho, o remetente somos NÓS — aí o alt pode ser o nosso
  // próprio número, e não o do contato; só aprende o par se não for esse
  // caso (ou se a conversa for mesmo o "Mensagens para mim").
  const alt = key.remoteJidAlt;
  if (alt) {
    const proprioPn = soDigitos(sock.user?.id);
    const proprioLid = soDigitos(sock.user?.lid);
    const conversaEhPropria = soDigitos(jid) === proprioLid || soDigitos(jid) === proprioPn;
    const altEhProprio = soDigitos(alt) === proprioPn || soDigitos(alt) === proprioLid;
    if (!altEhProprio || conversaEhPropria) {
      if (isLidUser(jid) && isPnUser(alt)) registrarMapeamento(jid, alt);
      else if (isPnUser(jid) && isLidUser(alt)) registrarMapeamento(alt, jid);
    }
  }

  if (isPnUser(jid)) return soDigitos(jid);

  const conhecido = resolverTelefonePorLid(jid);
  if (conhecido) return conhecido;

  try {
    const pn = await sock.signalRepository?.lidMapping?.getPNForLID(jid);
    if (pn) {
      registrarMapeamento(jid, pn);
      return resolverTelefonePorLid(jid);
    }
  } catch (erro) {
    console.error(`[lid-cache] Falha ao consultar o mapeamento LID do Baileys pra ${jid}:`, erro.message);
  }
  return null;
}
