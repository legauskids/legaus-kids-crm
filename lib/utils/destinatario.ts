// Pra quem vai o material pelo WhatsApp (orçamento, apresentação, produtos):
// contato escolhido pela busca por nome ou final do telefone, ou um número
// digitado inteiro. Pedido de 2026-11-17.

import { telefoneLegivel } from "./telefone";

export type DestinatarioEnvio = { contatoId: string; nome: string; telefone: string; telefoneFormatado: string };

/** O cliente do orçamento já vem escolhido, se tiver telefone. */
export function destinatarioDoContato(c: { id: string; nome: string; telefone: string | null } | null | undefined): DestinatarioEnvio | null {
  if (!c?.telefone) return null;
  return { contatoId: c.id, nome: c.nome, telefone: c.telefone, telefoneFormatado: telefoneLegivel(c.telefone) };
}

/**
 * Como buscar o que foi digitado: só número (com ou sem pontuação) com 10
 * dígitos ou mais é o telefone inteiro; de 4 a 9 é o final (os 8 finais são
 * iguais com ou sem o 9 do celular); texto é nome. Menos que isso não busca.
 */
export function tipoBuscaDestinatario(termo: string): { tipo: "telefone" } | { tipo: "final"; digitos: string } | { tipo: "nome" } | null {
  const t = termo.trim();
  if (t.length < 2) return null;
  if (!/^[\d\s()+.-]+$/.test(t)) return { tipo: "nome" };
  const digitos = t.replace(/\D/g, "");
  if (digitos.length >= 10) return { tipo: "telefone" };
  if (digitos.length >= 4) return { tipo: "final", digitos: digitos.slice(-8) };
  return null;
}
