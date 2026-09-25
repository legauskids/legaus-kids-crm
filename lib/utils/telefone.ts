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
