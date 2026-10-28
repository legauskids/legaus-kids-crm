import fs from "node:fs";
import { isLidUser, isPnUser } from "@whiskeysockets/baileys";
import { chamarApi } from "./crm-api.js";
import { resolverTelefonePorLid } from "./lid-cache.js";
import { chaveTelefone } from "./telefone.js";

const ARQUIVO_AGENDA = "nomes-agenda.json";
const LOTE_MAXIMO = 200;

/**
 * Nome salvo na agenda do celular da Legaus (pedido do Marcos de
 * 2026-10-28: "o nome que for salvo no celular precisa sincronizar com o
 * CRM"). Quando alguém salva ou edita um contato no celular, o WhatsApp
 * manda a mudança pros aparelhos conectados e o Baileys emite
 * `contacts.upsert` com o nome da agenda (contactAction/lidContactAction —
 * o nome do perfil da pessoa vem em outro evento, `contacts.update`, e já
 * chega no CRM junto de cada mensagem).
 *
 * Aqui: guarda telefone -> nome em disco (o CRM usa ao criar o contato
 * quando a pessoa manda mensagem pela primeira vez) e repassa a mudança pro
 * CRM, que troca o nome do cadastro se o número já estiver lá
 * (lib/server/contatos.ts, aplicarNomesDaAgenda).
 */

/** Telefone (só dígitos) e nome de cada contato da agenda num evento contacts.upsert. */
export function nomesDoEvento(contatos, resolverLid = resolverTelefonePorLid) {
  const saida = [];
  for (const c of contatos ?? []) {
    const nome = typeof c?.name === "string" ? c.name.trim().replace(/\s+/g, " ") : "";
    if (!nome) continue;
    let jid = null;
    if (c.id && isPnUser(c.id)) jid = c.id;
    else if (c.phoneNumber && isPnUser(c.phoneNumber)) jid = c.phoneNumber;
    else if (c.id && isLidUser(c.id)) jid = resolverLid(c.id);
    const telefone = jid ? String(jid).split("@")[0].split(":")[0].replace(/\D/g, "") : "";
    if (telefone.length < 10) continue;
    saida.push({ telefone, nome });
  }
  return saida;
}

function carregar() {
  try {
    if (fs.existsSync(ARQUIVO_AGENDA)) return new Map(Object.entries(JSON.parse(fs.readFileSync(ARQUIVO_AGENDA, "utf8"))));
  } catch (erro) {
    console.error("[agenda] Falha ao carregar nomes da agenda do disco:", erro.message);
  }
  return new Map();
}

// chaveTelefone (DDD + 8 finais) -> nome: acha o mesmo celular com ou sem o 9.
const agenda = carregar();
const pendentes = new Map();
let timer = null;

function salvar() {
  try {
    fs.writeFileSync(ARQUIVO_AGENDA, JSON.stringify(Object.fromEntries(agenda), null, 2));
  } catch (erro) {
    console.error("[agenda] Falha ao salvar nomes da agenda no disco:", erro.message);
  }
}

/** Nome do telefone na agenda do celular, se alguém salvou. */
export function nomeDaAgenda(telefone) {
  return agenda.get(chaveTelefone(telefone)) ?? null;
}

/** Alimenta a agenda a partir de um evento contacts.upsert do Baileys e agenda o envio pro CRM. */
export function aprenderNomesDaAgenda(contatos) {
  const nomes = nomesDoEvento(contatos);
  if (!nomes.length) return;
  let mudou = false;
  for (const { telefone, nome } of nomes) {
    const chave = chaveTelefone(telefone);
    if (agenda.get(chave) !== nome) {
      agenda.set(chave, nome);
      mudou = true;
    }
    pendentes.set(telefone, nome);
  }
  if (mudou) salvar();
  agendarEnvio(5000);
}

function agendarEnvio(ms) {
  if (!timer) timer = setTimeout(enviarPendentes, ms);
}

// Junta as mudanças de alguns segundos num envio só (uma edição na agenda
// pode chegar repetida, e uma sincronização maior chega em rajada).
async function enviarPendentes() {
  timer = null;
  const lote = [...pendentes].slice(0, LOTE_MAXIMO).map(([telefone, nome]) => ({ telefone, nome }));
  if (!lote.length) return;
  try {
    const r = await chamarApi("/api/integracoes/whatsapp/contatos/nomes-agenda", {
      method: "POST",
      body: JSON.stringify({ contatos: lote }),
    });
    for (const { telefone, nome } of lote) if (pendentes.get(telefone) === nome) pendentes.delete(telefone);
    console.log(
      `[agenda] ${lote.length} nome(s) da agenda repassado(s) ao CRM: ${r.atualizados ?? 0} atualizado(s), ${r.iguais ?? 0} igual(is), ${r.semCadastro ?? 0} fora do CRM, ${r.protegidos ?? 0} com CNPJ (mantido)`,
    );
  } catch (erro) {
    console.error(`[agenda] Falha ao repassar ${lote.length} nome(s) da agenda pro CRM (tento de novo em 1 min):`, erro.message);
    agendarEnvio(60000);
    return;
  }
  if (pendentes.size) agendarEnvio(1000);
}
