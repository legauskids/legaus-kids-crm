// Comparação de telefone brasileiro tolerante a formato. O mesmo número
// aparece gravado de jeitos diferentes em Contato.telefone (sempre só
// dígitos, mas): vindo do WhatsApp chega no formato interno dele (com 55 e,
// pra números antigos, SEM o 9 extra do celular — ex. 555584370956); vindo
// de cadastro manual ou do agente, do jeito que foi digitado (ex.
// 51997715704). Comparar a string inteira deixava "esse contato já está
// salvo?" sem resposta e criava cadastro duplicado.

export type PartesTelefone = {
  /** DDD (2 dígitos) ou null quando o número veio sem DDD. */
  ddd: string | null;
  /** Os 8 dígitos finais — iguais com ou sem o 9 extra do celular. */
  final8: string;
};

export function soDigitosTelefone(valor: string): string {
  return valor.replace(/\D/g, "");
}

/** Quebra um telefone em DDD + 8 finais; null se não tiver dígitos suficientes. */
export function partesTelefone(valor: string): PartesTelefone | null {
  let d = soDigitosTelefone(valor);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) return { ddd: d.slice(0, 2), final8: d.slice(-8) };
  if (d.length === 8 || d.length === 9) return { ddd: null, final8: d.slice(-8) };
  return null;
}

/**
 * É o mesmo número? Mesmos 8 finais e, quando os dois lados têm DDD, mesmo
 * DDD — com ou sem 55, com ou sem o 9 extra, com ou sem máscara.
 */
export function mesmoTelefone(a: string, b: string): boolean {
  const pa = partesTelefone(a);
  const pb = partesTelefone(b);
  if (!pa || !pb || pa.final8 !== pb.final8) return false;
  return pa.ddd === null || pb.ddd === null || pa.ddd === pb.ddd;
}

/**
 * O termo de busca é um telefone (e não um nome)? Só dígitos e pontuação de
 * telefone, com pelo menos 8 dígitos.
 */
export function pareceTelefone(termo: string): boolean {
  return /^[\d\s()+.-]+$/.test(termo.trim()) && partesTelefone(termo) !== null;
}

/**
 * Final de telefone pra busca ("6980", "2-6980"): só dígitos e pontuação, de
 * 4 a 7 dígitos; null se não for. Os 8 finais são iguais com ou sem o 9 do
 * celular, então "termina com" acha nos dois formatos. Pedido de 2026-10-16:
 * "acha o contato com final 6980" não achava nada — a busca pedia o número
 * inteiro.
 */
export function finalDeTelefone(termo: string): string | null {
  if (!/^[\d\s()+.-]+$/.test(termo.trim())) return null;
  const digitos = soDigitosTelefone(termo);
  return digitos.length >= 4 && digitos.length <= 7 ? digitos : null;
}

/**
 * Padrão do telefone gravado e mostrado (pedido do Marcos, 2026-10-14): só
 * dígitos, com 55 e, no CELULAR, com o 9 na frente — 55 + DDD + 9 + 8.
 * "54 9696-0296" -> "5554996960296". Fixo (começa com 2 a 5) fica com 8
 * dígitos. Sem DDD ou fora do padrão brasileiro: só tira a máscara.
 * Contato que chega pelo WhatsApp continua gravado no formato interno dele
 * (às vezes sem o 9) — a busca tolera os dois (ver mesmoTelefone).
 */
export function telefonePadraoBR(valor: string): string {
  let d = soDigitosTelefone(valor);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length === 12 && d.startsWith("55") && /[6-9]/.test(d[4])) d = `${d.slice(0, 4)}9${d.slice(4)}`;
  return d;
}

/** O contato já tem nome salvo, ou o "nome" ainda é o próprio telefone (ou está vazio)? */
export function temNomeSalvo(nome: string): boolean {
  return !/^[\d\s()+.-]*$/.test(nome.trim());
}

/** "555596356217" -> "(55) 99635-6217" — sempre no padrão com o 9 do celular, pra ninguém reformatar de cabeça. */
export function telefoneLegivel(telefone: string): string {
  const d = telefonePadraoBR(telefone).replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return telefone;
}
