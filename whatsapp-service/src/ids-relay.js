// Registro curto (em memória) dos IDs de mensagem que o PRÓPRIO relay-saida.js
// acabou de mandar — usado por relay-comando-agente.js pra nunca reprocessar
// a resposta automática do agente como se fosse um comando novo.
//
// Bug real visto ao vivo em 2026-09-05: como TELEFONES_AUTORIZADOS vale nas
// duas direções (de propósito, pra dar suporte a self-chat), toda resposta
// que o agente manda pro WhatsApp de um número autorizado (ex: o próprio
// Marcos) também aparece no messages.upsert como fromMe:true, remoteJid =
// aquele mesmo número autorizado — batendo em autorizado() de novo. Sem esse
// filtro, o agente respondia a si mesmo em loop (ex: "Até mais!" -> agente
// repete "Até mais!" -> reprocessado como comando -> repete de novo, pra
// sempre). Um TTL curto é suficiente: só precisa cobrir a janela entre
// mandar e o próprio Baileys ecoar a mensagem de volta, não guardar histórico.
const TTL_MS = 5 * 60 * 1000;
const idsRecentes = new Map();

export function marcarComoEnviadoPeloRelay(id) {
  if (!id) return;
  idsRecentes.set(id, Date.now());
  if (idsRecentes.size > 1000) {
    const limite = Date.now() - TTL_MS;
    for (const [chave, quando] of idsRecentes) {
      if (quando < limite) idsRecentes.delete(chave);
    }
  }
}

export function foiEnviadoPeloRelay(id) {
  if (!id || !idsRecentes.has(id)) return false;
  const quando = idsRecentes.get(id);
  if (Date.now() - quando > TTL_MS) {
    idsRecentes.delete(id);
    return false;
  }
  return true;
}
