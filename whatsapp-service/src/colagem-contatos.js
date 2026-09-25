import { mesmoTelefone } from "./telefone.js";

// Rotina de prospecção (pedido do Marcos em 2026-09-25): ele e a Dani colam
// números de telefone, um atrás do outro, no "Mensagens para mim" do
// WhatsApp da Legaus — ex. "(51) 99771-5704", às vezes dezenas seguidas.
// Como o próprio número da Legaus está em WHATSAPP_COMANDO_TELEFONES (pra
// self-chat funcionar como canal de comando), cada número colado virava um
// comando pro agente, que respondia a cada um no próprio chat.
//
// Regra combinada: número (ou cartão de contato) colado SOZINHO não é
// comando — não vai pro agente nem pro CRM. Quando é pra agir, a colagem vem
// seguida de um comando; por isso os números colados ficam guardados por um
// tempo curto e seguem junto com o próximo comando de verdade, como contexto
// ("cadastra esse como lead" precisa saber quem é "esse").

// Guardados por no máximo 10 min: colagem mais antiga que isso não tem mais
// relação com o comando que chegar depois (ex.: lista colada de manhã pra
// prospectar, comando à tarde sobre outra coisa).
const VALIDADE_MS = 10 * 60 * 1000;
// Teto pro contexto não virar uma lista enorme depois de uma colagem em massa.
const MAXIMO_NO_CONTEXTO = 20;
// Só a ÚLTIMA leva de colagem vai junto com o comando: o último colado e os
// que vieram grudados nele (até 30s entre um e outro). Visto no primeiro
// teste real em 2026-09-25: 2 números colados, 1 minuto depois 1 contato
// avulso + "salve este contato como Caroline" — o agente recebeu os 3 e
// teve que perguntar qual era; a intenção era só o avulso, logo antes.
const INTERVALO_MAXIMO_NA_LEVA_MS = 30 * 1000;

/**
 * Número de telefone brasileiro plausível, com ou sem 55 na frente:
 * DDD válido (11-99, sem zero) + celular (9 + 8 dígitos) ou 8 dígitos
 * começando com 2-9 — fixo (2-5) ou celular escrito no formato antigo, sem
 * o 9 extra (6-9), que ainda aparece muito (ex.: "55 9221-2473", visto no
 * primeiro teste em 2026-09-25). Só pra não confundir com valor, código,
 * protocolo etc.
 */
function ehTelefoneBrasileiro(digitos) {
  let d = digitos;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return false;
  if (!/^[1-9][1-9]/.test(d)) return false;
  const assinante = d.slice(2);
  if (assinante.length === 9) return assinante.startsWith("9");
  return /^[2-9]/.test(assinante);
}

/**
 * Se o texto for SÓ telefone(s) — um por linha, ou separados por vírgula,
 * ponto-e-vírgula ou tabulação — devolve a lista (como foi escrita). Se
 * tiver qualquer outra coisa (uma palavra, uma data, um valor), devolve null
 * e a mensagem segue como comando normal.
 */
export function extrairSoTelefones(texto) {
  if (!texto) return null;
  const partes = texto
    .split(/[\n,;\t]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!partes.length) return null;
  for (const parte of partes) {
    if (!/^\+?[\d\s().-]+$/.test(parte)) return null;
    // CPF digitado com pontos (123.456.789-00) nunca é telefone.
    if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(parte)) return null;
    if (!ehTelefoneBrasileiro(parte.replace(/\D/g, ""))) return null;
  }
  return partes;
}

/**
 * Cartão(ões) de contato compartilhado (contactMessage / contactsArrayMessage)
 * -> ["Fulano — 5551997715704", ...]; null se a mensagem não for isso.
 */
export function extrairCartoesDeContato(msg) {
  const contatos = msg.message?.contactMessage
    ? [msg.message.contactMessage]
    : msg.message?.contactsArrayMessage?.contacts || [];
  const itens = [];
  for (const contato of contatos) {
    const linhaTel = (contato?.vcard || "").split(/\r?\n/).find((l) => l.toUpperCase().startsWith("TEL"));
    const telefone = linhaTel?.split(":").pop()?.replace(/\D/g, "");
    if (telefone) itens.push(`${contato.displayName || "Contato sem nome"} — ${telefone}`);
  }
  return itens.length ? itens : null;
}

const colagens = new Map(); // quem mandou (telefone) -> [{ item, em }]

export function guardarColagem(remetente, itens) {
  const agora = Date.now();
  const atuais = (colagens.get(remetente) || []).filter((c) => agora - c.em <= VALIDADE_MS);
  for (const item of itens) atuais.push({ item, em: agora });
  colagens.set(remetente, atuais);
}

/**
 * Tira (e esquece) o que foi colado por esse remetente e devolve a última
 * leva (ver INTERVALO_MAXIMO_NA_LEVA_MS), dos últimos 10 min, já como texto
 * de contexto pro agente — ou null se não houver nada.
 */
export function retirarContextoDeColagem(remetente) {
  const agora = Date.now();
  const recentes = (colagens.get(remetente) || []).filter((c) => agora - c.em <= VALIDADE_MS);
  colagens.delete(remetente);
  if (!recentes.length) return null;
  let inicioDaLeva = recentes.length - 1;
  while (inicioDaLeva > 0 && recentes[inicioDaLeva].em - recentes[inicioDaLeva - 1].em <= INTERVALO_MAXIMO_NA_LEVA_MS) {
    inicioDaLeva--;
  }
  const validas = recentes.slice(inicioDaLeva);
  const itens = validas.slice(-MAXIMO_NO_CONTEXTO).map((c) => c.item);
  const cortados = validas.length - itens.length;
  return (
    `[Contexto: contato(s) colado(s) no WhatsApp logo antes deste comando` +
    (cortados > 0 ? ` (os ${itens.length} mais recentes de ${validas.length})` : "") +
    `: ${itens.join("; ")}. Use se o comando se referir a eles.]`
  );
}

/** Junta o contexto da colagem (se houver) com o texto do comando. */
export function comContexto(contexto, texto) {
  return [contexto, texto].filter(Boolean).join("\n\n") || undefined;
}

const PROPRIO_NUMERO = process.env.WHATSAPP_PAREAMENTO_TELEFONE || "";

/** A conversa é o "Mensagens para mim" do próprio WhatsApp da Legaus? */
export function ehProprioNumero(telefone) {
  return !!PROPRIO_NUMERO && mesmoTelefone(telefone, PROPRIO_NUMERO);
}
