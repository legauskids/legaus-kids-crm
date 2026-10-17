// Artes dos posts do Instagram no padrão da marca aprovado pelo Marcos em
// 2026-10-16 (docs/referencias/legaus-posts/POSTS-INSTAGRAM.md, seção 3).
// Pura e testável: o modelo de dados de uma arte (o mesmo do editor) e a
// montagem inicial das artes de um post a partir das fotos. Quem desenha é
// lib/server/postagem-render.ts — um renderizador só, no servidor.
//
// Regras da marca que valem aqui: só as cores da marca; logo só muda de
// tamanho e posição; no máximo 3 informações por imagem (título + 2 selos);
// títulos e selos começam com maiúscula; no story nada importante nos 250 px
// de cima nem de baixo.

export const CORES_MARCA = {
  laranja: "#F74D1E",
  teal: "#0AA99E",
  branco: "#FFFFFF",
  escuro: "#2B2B2B",
  claro: "#FFF6F1",
} as const;

export type CorMarca = keyof typeof CORES_MARCA;

export type FormatoArte = "FEED" | "STORY";
export const TAMANHO_ARTE: Record<FormatoArte, { w: number; h: number }> = {
  FEED: { w: 1080, h: 1350 },
  STORY: { w: 1080, h: 1920 },
};

export type ConteudoPostagem = "ENTREGA" | "INSTALACAO" | "TBT" | "PRODUTO" | "BENEFICIOS";

export const ROTULO_CONTEUDO: Record<ConteudoPostagem, string> = {
  ENTREGA: "Entrega / obra pronta",
  INSTALACAO: "Instalação em andamento",
  TBT: "TBT",
  PRODUTO: "Produto / oferta",
  BENEFICIOS: "Benefícios",
};

export type LinhaTitulo = { t: string; tam: number; cor: CorMarca };

export type ElementoTitulo = { id: string; tipo: "titulo"; x: number; y: number; escala: number; linhas: LinhaTitulo[] };
export type ElementoSelo = { id: string; tipo: "selo"; x: number; y: number; t: string; tam: number; estilo: "laranja" | "branco" };
/** Logo: centro horizontal (cx), borda de baixo (base) e largura. Só tamanho e posição mudam. */
export type ElementoLogo = { id: string; tipo: "logo"; cx: number; base: number; larg: number };
export type ElementoArte = ElementoTitulo | ElementoSelo | ElementoLogo;

/** Foto numa caixa [x0, y0, x1, y1], recortada sem distorcer; fx/fy = ponto focal (0 a 1). */
export type FotoArte = { imagemId: string; box: [number, number, number, number]; fx: number; fy: number; zoom: number };

export type DadosArte = { w: number; h: number; fotos: FotoArte[]; elementos: ElementoArte[] };

// Medidas do padrão aprovado (seção 3 do documento).
export const BORDA = 32;
export const ESPACO_FOTOS = 16;
export const RAIO_FOTO = 26;
// Medidas do título "adesivo" calibradas nos pixels das artes aprovadas
// (capa e story de 16/10, desenhadas pelo legaus_render.py): cada linha
// começa onde a anterior termina (altura × 1,259 + contorno − 6).
const AVANCO_LINHA_TITULO = 1.259;
const ESPACO_LINHAS_TITULO = -6;
/** Contorno branco do título, em px. */
export function contornoTitulo(tam: number): number {
  return Math.max(8, Math.round(tam * 0.11));
}

/** Topo de cada linha (no sistema do legaus_render.py) e a altura total do título. */
export function linhasDoTitulo(linhas: LinhaTitulo[], escala = 1): { topos: number[]; altura: number } {
  const topos: number[] = [];
  let y = 0;
  for (const l of linhas) {
    const tam = l.tam * escala;
    topos.push(Math.round(y));
    y += tam * AVANCO_LINHA_TITULO + contornoTitulo(tam) + ESPACO_LINHAS_TITULO;
  }
  // +4: os selos das artes aprovadas ficam 3–4 px abaixo do fim calculado.
  return { topos, altura: Math.round(y) + (linhas.length ? 4 : 0) };
}

export function alturaTitulo(linhas: LinhaTitulo[], escala = 1): number {
  return linhasDoTitulo(linhas, escala).altura;
}

export function alturaSelo(tam: number): number {
  return Math.round(tam * 2);
}

/** Toda frase de título e selo começa com maiúscula (regra 4 da marca). */
export function comMaiuscula(texto: string): string {
  const t = texto.trim();
  return t ? t[0].toLocaleUpperCase("pt-BR") + t.slice(1) : t;
}

type Medidas = { tituloY: number; tamLinhas: [number, number]; tamSelo: number; gapSelo: number; logoLarg: number; logoBase: number };
const MEDIDAS: Record<FormatoArte, Medidas> = {
  FEED: { tituloY: 62, tamLinhas: [58, 100], tamSelo: 27, gapSelo: 22, logoLarg: 340, logoBase: 1350 - 64 },
  STORY: { tituloY: 250, tamLinhas: [66, 114], tamSelo: 30, gapSelo: 24, logoLarg: 400, logoBase: 1920 - 270 },
};
const LOGO_SLIDE = { larg: 250, base: 1350 - 56 };
const X_TEXTOS = 66;
/** Largura útil do título (a arte tem 1080; sobra a margem dos dois lados). */
const LARGURA_TITULO = 1080 - 2 * X_TEXTOS;
/** Largura média de um caractere da Baloo 2 ExtraBold, em proporção do tamanho (estimativa conservadora). */
const LARGURA_CARACTERE_TITULO = 0.56;

/** Diminui o tamanho da linha pra caber na largura da arte. */
export function tamanhoQueCabe(texto: string, tam: number, largura = LARGURA_TITULO): number {
  const estimada = texto.length * tam * LARGURA_CARACTERE_TITULO;
  return estimada <= largura ? tam : Math.max(28, Math.floor(largura / (texto.length * LARGURA_CARACTERE_TITULO)));
}

/** Título (2 linhas: pequena verde-azulada, grande laranja) + até 2 selos + logo, nas posições do padrão. */
export function elementosDaCapa(formato: FormatoArte, titulo: [string, string], selos: string[]): ElementoArte[] {
  const m = MEDIDAS[formato];
  const linhas = (
    [
      { t: comMaiuscula(titulo[0]), tam: tamanhoQueCabe(titulo[0], m.tamLinhas[0]), cor: "teal" },
      { t: comMaiuscula(titulo[1]), tam: tamanhoQueCabe(titulo[1], m.tamLinhas[1]), cor: "laranja" },
    ] satisfies LinhaTitulo[]
  ).filter((l) => l.t);
  const elementos: ElementoArte[] = [];
  let y = m.tituloY;
  if (linhas.length) {
    elementos.push({ id: "titulo", tipo: "titulo", x: X_TEXTOS, y, escala: 1, linhas });
    y += alturaTitulo(linhas) + m.gapSelo;
  }
  selos
    .map(comMaiuscula)
    .filter(Boolean)
    .slice(0, 2)
    .forEach((t, i) => {
      elementos.push({ id: `selo${i + 1}`, tipo: "selo", x: X_TEXTOS, y, t, tam: m.tamSelo, estilo: i === 0 ? "laranja" : "branco" });
      y += alturaSelo(m.tamSelo) + 12;
    });
  elementos.push({ id: "logo", tipo: "logo", cx: 540, base: m.logoBase, larg: m.logoLarg });
  return elementos;
}

export type FotoDoPost = { id: string; largura: number; altura: number };

const vertical = (f: FotoDoPost) => f.altura > f.largura * 1.05;

function caixaInteira(formato: FormatoArte): [number, number, number, number] {
  const { w, h } = TAMANHO_ARTE[formato];
  return [BORDA, BORDA, w - BORDA, h - BORDA];
}

/** Slide com 2 fotos empilhadas (ou 1, se sobrar) e a logo menor. */
function slide(fotos: FotoDoPost[]): DadosArte {
  const { w, h } = TAMANHO_ARTE.FEED;
  const meia = Math.floor((h - 2 * BORDA - ESPACO_FOTOS) / 2);
  const caixas: [number, number, number, number][] =
    fotos.length === 1 ? [caixaInteira("FEED")] : [[BORDA, BORDA, w - BORDA, BORDA + meia], [BORDA, BORDA + meia + ESPACO_FOTOS, w - BORDA, h - BORDA]];
  return {
    w,
    h,
    fotos: fotos.map((f, i) => ({ imagemId: f.id, box: caixas[i], fx: 0.5, fy: 0.5, zoom: 1 })),
    elementos: [{ id: "logo", tipo: "logo", cx: 540, base: LOGO_SLIDE.base, larg: LOGO_SLIDE.larg }],
  };
}

function capa(formato: FormatoArte, foto: FotoDoPost, titulo: [string, string], selos: string[]): DadosArte {
  const { w, h } = TAMANHO_ARTE[formato];
  return { w, h, fotos: [{ imagemId: foto.id, box: caixaInteira(formato), fx: 0.5, fy: formato === "FEED" ? 0.42 : 0.5, zoom: 1 }], elementos: elementosDaCapa(formato, titulo, selos) };
}

export type ArteMontada = { formato: FormatoArte; dados: DadosArte };

export type PedidoArtes = {
  conteudo: ConteudoPostagem;
  fotos: FotoDoPost[];
  /** Linha pequena e linha grande do título. */
  titulo: [string, string];
  selos: string[];
  /** Benefícios: um argumento por slide. */
  argumentos?: string[];
};

/** Carrossel tem no máximo 10 itens (capa + 9). */
const MAX_CARROSSEL = 10;

/**
 * Artes iniciais de um post (seção 3, "Formatos por tipo de post"): foto
 * vertical vai pra capa e pro story; as largas vão de 2 em 2 nos slides.
 */
export function montarArtes(p: PedidoArtes): ArteMontada[] {
  if (p.fotos.length === 0) return [];
  const ordenadas = [...p.fotos];
  const principal = ordenadas.find(vertical) ?? ordenadas[0];
  const resto = ordenadas.filter((f) => f.id !== principal.id);
  const story = (): ArteMontada => ({ formato: "STORY", dados: capa("STORY", principal, p.titulo, p.selos) });

  switch (p.conteudo) {
    case "INSTALACAO":
    case "TBT":
      return [story()];
    case "PRODUTO":
      return [{ formato: "FEED", dados: capa("FEED", principal, p.titulo, p.selos) }, story()];
    case "BENEFICIOS": {
      const artes: ArteMontada[] = [{ formato: "FEED", dados: capa("FEED", principal, p.titulo, p.selos) }];
      const argumentos = (p.argumentos ?? []).map((a) => a.trim()).filter(Boolean).slice(0, MAX_CARROSSEL - 1);
      argumentos.forEach((argumento, i) => {
        const foto = resto.length ? resto[i % resto.length] : principal;
        artes.push({ formato: "FEED", dados: capa("FEED", foto, ["", argumento], []) });
      });
      return artes;
    }
    case "ENTREGA":
    default: {
      const artes: ArteMontada[] = [{ formato: "FEED", dados: capa("FEED", principal, p.titulo, p.selos) }];
      // Largas primeiro (ficam melhores empilhadas), na ordem em que vieram.
      const paraSlides = [...resto.filter((f) => !vertical(f)), ...resto.filter(vertical)];
      for (let i = 0; i < paraSlides.length && artes.length < MAX_CARROSSEL; i += 2) {
        artes.push({ formato: "FEED", dados: slide(paraSlides.slice(i, i + 2)) });
      }
      artes.push(story());
      return artes;
    }
  }
}

/** Textos das artes de um post (Postagem.textos). */
export type TextosPostagem = { titulo: [string, string]; selos: string[]; preco?: string | null; argumentos?: string[] };

/** Título e selos padrão de cada tipo — o Marcos troca na tela. Produto/oferta leva o preço no selo laranja. */
export function textosPadrao(conteudo: ConteudoPostagem, produto: string, preco?: string | null): { titulo: [string, string]; selos: string[] } {
  const item = comMaiuscula(produto) || "Playground";
  switch (conteudo) {
    case "INSTALACAO":
      return { titulo: ["Instalação em", "Andamento"], selos: [] };
    case "TBT":
      return { titulo: ["#TBT", item], selos: [] };
    case "PRODUTO":
      return { titulo: ["Conheça o", item], selos: [preco?.trim() ? `Por ${preco.trim()}` : "", "Qualidade e Segurança"].filter(Boolean) };
    case "BENEFICIOS":
      return { titulo: ["Por que escolher a", "Legaus Kids"], selos: [] };
    case "ENTREGA":
    default:
      return { titulo: ["Entrega de", item], selos: ["Diversão Garantida", "Qualidade e Segurança"] };
  }
}
