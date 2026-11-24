// Negócio ganho ganha uma cópia no Funil de pós-venda com o mesmo título +
// " — Pós-venda" (lib/server/automations.ts). Decisão do Marcos (2026-10-07,
// depois do 3º teste do agente financeiro: "Manutenção FEMA" empatava com
// "Manutenção FEMA — Pós-venda" e o agente dizia que não tinha encontrado):
// pra despesas e receitas os dois são o mesmo projeto e o lançamento vai pro
// pós-venda, onde ficam produção e instalação.

export const SUFIXO_POS_VENDA = " — Pós-venda";

export const MAX_TITULO_NEGOCIO = 200;

/** O título sem o " — Pós-venda" do fim (com ou sem o espaço antes do travessão). */
export function semSufixoPosVenda(titulo: string): string {
  const marca = SUFIXO_POS_VENDA.trim();
  return titulo.endsWith(marca) ? titulo.slice(0, -marca.length).trimEnd() : titulo;
}

/**
 * Renomear um negócio (pedido de 2026-11-24): como venda e pós-venda se
 * reconhecem pelo título, o outro do par (mesmo cliente) acompanha, e o
 * pós-venda que tem o sufixo continua com ele — só o nome antes muda.
 * `gemeoAtual`: o título de hoje do outro do par, para procurar; null = não
 * tem par.
 */
export function renomeacaoDoPar(input: { atual: string; novo: string; ehPosVenda: boolean }): {
  titulo: string;
  gemeoAtual: string | null;
  gemeoNovo: string | null;
} {
  const novo = input.novo.trim().replace(/\s+/g, " ");
  if (!input.ehPosVenda) return { titulo: novo, gemeoAtual: `${input.atual}${SUFIXO_POS_VENDA}`, gemeoNovo: `${novo}${SUFIXO_POS_VENDA}` };
  if (!input.atual.endsWith(SUFIXO_POS_VENDA)) return { titulo: novo, gemeoAtual: null, gemeoNovo: null };
  const base = semSufixoPosVenda(novo);
  return { titulo: `${base}${SUFIXO_POS_VENDA}`, gemeoAtual: semSufixoPosVenda(input.atual), gemeoNovo: base };
}

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
