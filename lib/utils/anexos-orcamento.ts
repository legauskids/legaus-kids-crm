import { z } from "zod";

// Imagens anexas ao orçamento (pedido de 2026-11-11): saem em folha(s) A4
// depois do orçamento. A mesma conta de posição serve pra prévia na tela, pra
// impressão/link público e pro PDF — o que se vê no editor é o que sai.

export const MAX_ANEXOS = 20;
export const TAMANHO_MIN = 20;
export const TAMANHO_MAX = 100;
export const TAMANHO_PADRAO = 100;
export const LEGENDA_MAX = 80;

export const TAMANHOS_RAPIDOS = [
  { rotulo: "1/4", valor: 25 },
  { rotulo: "1/3", valor: 33 },
  { rotulo: "1/2", valor: 50 },
  { rotulo: "2/3", valor: 67 },
  { rotulo: "Inteira", valor: 100 },
] as const;

export type AnexoOrcamentoVM = {
  id: string;
  nome: string | null;
  legenda: string | null;
  largura: number;
  altura: number;
  tamanho: number;
};

/** Folha A4 em pontos (igual ao PDF). Posições das imagens contam a partir do canto da área útil, abaixo do cabeçalho. */
export const FOLHA = {
  largura: 595.28,
  altura: 841.89,
  margem: 32,
  cabecalho: 48,
  espaco: 12,
  legenda: 16,
} as const;

export const AREA_UTIL = {
  largura: FOLHA.largura - 2 * FOLHA.margem,
  altura: FOLHA.altura - 2 * FOLHA.margem - FOLHA.cabecalho,
};

export type CaixaAnexo = {
  id: string;
  x: number;
  y: number;
  largura: number;
  /** Altura só da imagem; a legenda (se houver) vem logo abaixo, com FOLHA.legenda de altura. */
  altura: number;
  legenda: string | null;
};

export const limitarTamanho = (tamanho: number) =>
  Math.min(TAMANHO_MAX, Math.max(TAMANHO_MIN, Math.round(Number.isFinite(tamanho) ? tamanho : TAMANHO_PADRAO)));

export const limparLegenda = (legenda: string | null | undefined) => legenda?.replace(/\s+/g, " ").trim().slice(0, LEGENDA_MAX) || null;

/**
 * Distribui as imagens em linhas (centralizadas) e as linhas em folhas.
 * "tamanho" é a fração da largura útil contando o espaço entre imagens: duas
 * de 50% (ou três de 33%) cabem lado a lado. Imagem muito alta encolhe pra
 * caber numa folha.
 */
export function paginarAnexos(anexos: Pick<AnexoOrcamentoVM, "id" | "largura" | "altura" | "tamanho" | "legenda">[]): CaixaAnexo[][] {
  const W = AREA_UTIL.largura;
  const H = AREA_UTIL.altura;
  const G = FOLHA.espaco;

  const caixas = anexos.map((a) => {
    const legenda = limparLegenda(a.legenda);
    const extra = legenda ? FOLHA.legenda : 0;
    const proporcao = a.largura > 0 && a.altura > 0 ? a.altura / a.largura : 0.75;
    let largura = (limitarTamanho(a.tamanho) / 100) * (W + G) - G;
    let altura = largura * proporcao;
    if (altura + extra > H) {
      altura = H - extra;
      largura = altura / proporcao;
    }
    return { id: a.id, largura, altura, legenda, total: altura + extra };
  });

  const folhas: CaixaAnexo[][] = [];
  let folha: CaixaAnexo[] = [];
  let y = 0;

  const fecharLinha = (linha: typeof caixas) => {
    if (linha.length === 0) return;
    const alturaLinha = Math.max(...linha.map((c) => c.total));
    if (y > 0 && y + alturaLinha > H + 0.5) {
      folhas.push(folha);
      folha = [];
      y = 0;
    }
    const larguraLinha = linha.reduce((soma, c) => soma + c.largura, 0) + G * (linha.length - 1);
    let x = (W - larguraLinha) / 2;
    for (const c of linha) {
      folha.push({ id: c.id, x, y: y + (alturaLinha - c.total) / 2, largura: c.largura, altura: c.altura, legenda: c.legenda });
      x += c.largura + G;
    }
    y += alturaLinha + G;
  };

  let linha: typeof caixas = [];
  let larguraLinha = -G;
  for (const c of caixas) {
    if (linha.length > 0 && larguraLinha + G + c.largura > W + 0.5) {
      fecharLinha(linha);
      linha = [];
      larguraLinha = -G;
    }
    linha.push(c);
    larguraLinha += G + c.largura;
  }
  fecharLinha(linha);
  if (folha.length > 0) folhas.push(folha);
  return folhas;
}

/** O que o editor manda salvar: a lista inteira, na ordem. */
export const anexosParaSalvarSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(64),
      legenda: z.string().nullable().catch(null).transform(limparLegenda),
      tamanho: z.number().catch(TAMANHO_PADRAO).transform(limitarTamanho),
    }),
  )
  .max(MAX_ANEXOS);

export type AnexoParaSalvar = z.input<typeof anexosParaSalvarSchema>[number];

/** Endereço da imagem: com login, ou com o token do link público do orçamento. */
export const urlAnexo = (id: string, tokenPublico?: string | null) =>
  `/api/imagem/orcamento-anexo/${id}${tokenPublico ? `?t=${encodeURIComponent(tokenPublico)}` : ""}`;
