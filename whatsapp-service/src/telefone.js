// O WhatsApp guarda números brasileiros antigos SEM o 9 extra do celular
// (o JID interno da própria Legaus é 555599603257, o .env tem 5555999603257),
// e o Baileys 7 devolve o telefone sempre nesse formato interno
// (lidMapping.getPNForLID). Pra comparar "é o mesmo número?" sem depender de
// qual dos dois formatos veio, compara DDD + 8 dígitos finais.

function soDigitos(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}

/** Chave de comparação: DDD + 8 finais (sem 55 na frente, sem o 9 extra). */
export function chaveTelefone(telefone) {
  let d = soDigitos(telefone);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d.length >= 10 ? `${d.slice(0, 2)}${d.slice(-8)}` : d;
}

export function mesmoTelefone(a, b) {
  const ca = chaveTelefone(a);
  return !!ca && ca === chaveTelefone(b);
}
