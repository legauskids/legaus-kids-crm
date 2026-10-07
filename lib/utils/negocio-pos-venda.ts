// Negócio ganho ganha uma cópia no Funil de pós-venda com o mesmo título +
// " — Pós-venda" (lib/server/automations.ts). Decisão do Marcos (2026-10-07,
// depois do 3º teste do agente financeiro: "Manutenção FEMA" empatava com
// "Manutenção FEMA — Pós-venda" e o agente dizia que não tinha encontrado):
// pra despesas e receitas os dois são o mesmo projeto e o lançamento vai pro
// pós-venda, onde ficam produção e instalação.

export const SUFIXO_POS_VENDA = " — Pós-venda";

/**
 * Tira da lista o negócio de venda cuja cópia de pós-venda (mesmo título +
 * sufixo, mesmo cliente) também está nela — quem procura pelo nome cai
 * direto no pós-venda.
 */
export function semVendaComPosVenda<N extends { titulo: string; contatoNome: string | null }>(negocios: N[]): N[] {
  const chave = (titulo: string, contatoNome: string | null) => `${titulo}\u0000${contatoNome ?? ""}`;
  const posVenda = new Set(negocios.map((n) => chave(n.titulo, n.contatoNome)));
  return negocios.filter((n) => !posVenda.has(chave(`${n.titulo}${SUFIXO_POS_VENDA}`, n.contatoNome)));
}
