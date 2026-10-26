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
export type IconeSelo = "check" | "local";
/** Selo: ícone de check (padrão) ou de localização (pino — "Bob's Vacaria", pedido de 2026-10-21). */
export type ElementoSelo = { id: string; tipo: "selo"; x: number; y: number; t: string; tam: number; estilo: "laranja" | "branco"; icone?: IconeSelo };
/** Selo pedido na montagem: só o texto (check) ou texto + ícone. */
export type SeloPedido = string | { t: string; icone?: IconeSelo };
/** Logo: centro horizontal (cx), borda de baixo (base) e largura. Só tamanho e posição mudam. */
export type ElementoLogo = { id: string; tipo: "logo"; cx: number; base: number; larg: number };
export type ElementoArte = ElementoTitulo | ElementoSelo | ElementoLogo;

/** Onde estão os brinquedos na foto: caixa [x0, y0, x1, y1] de 0 a 1 (lib/server/enquadramento.ts). */
export type AlvoFoto = [number, number, number, number];

/**
 * Foto numa caixa [x0, y0, x1, y1], sem distorcer; fx/fy = ponto focal (0 a 1).
 * zoom 1 = a foto cobre a caixa; menor que 1 = a foto diminui até caber
 * inteira e o resto da caixa é a própria foto desfocada (26/10/2026).
 * alvo = onde estão os brinquedos (guardado pra reenquadrar sem perguntar de novo).
 */
export type FotoArte = { imagemId: string; box: [number, number, number, number]; fx: number; fy: number; zoom: number; alvo?: AlvoFoto };

export type DadosArte = { w: number; h: number; fotos: FotoArte[]; elementos: ElementoArte[] };

// Medidas do padrão aprovado (seção 3 do documento).
export const BORDA = 32;
export const ESPACO_FOTOS = 16;
export const RAIO_FOTO = 26;
/** Desfoque do fundo quando a foto diminui pra caber (zoom < 1): sigma no sharp, px no CSS da prévia. */
export const DESFOQUE_FUNDO = 28;
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

/**
 * Desenhando cada linha do título com altura de linha 1, a letra fica 0,31 ×
 * tamanho mais alta que no legaus_render.py (medido nas artes aprovadas): o
 * renderizador e a prévia do editor descem isso.
 */
export const DESLOCAMENTO_LETRA_TITULO = 0.31;

/** Medidas internas do selo (legaus_render.pill): altura, ícone, espaço e margem lateral. */
export function medidasSelo(tam: number) {
  const h = alturaSelo(tam);
  return { h, raioIcone: Math.round(h * 0.28), espaco: Math.round(tam * 0.45), margem: Math.round(tam * 0.75) };
}

/** Altura ÷ largura da logo original (public/legaus-logo.png, 2203 × 1404). */
export const LOGO_PROPORCAO = 1404 / 2203;

/** Ícone de check do selo, em SVG (o mesmo no servidor e na prévia do editor). */
export function iconeCheckSvg(raio: number, fundo: string, traco: string): string {
  const d = raio * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 ${d} ${d}"><circle cx="${raio}" cy="${raio}" r="${raio}" fill="${fundo}"/><polyline points="${raio * 0.55},${raio * 1.02} ${raio * 0.88},${raio * 1.35} ${raio * 1.48},${raio * 0.68}" fill="none" stroke="${traco}" stroke-width="${Math.max(4, Math.round(raio * 0.28))}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** Ícone de localização (pino) do selo de local, no mesmo círculo do check. */
export function iconePinoSvg(raio: number, fundo: string, traco: string): string {
  const d = raio * 2;
  const r = (k: number) => +(raio * k).toFixed(2);
  const pino = `M ${r(1)} ${r(1.56)} C ${r(0.74)} ${r(1.24)} ${r(0.6)} ${r(1.04)} ${r(0.6)} ${r(0.82)} A ${r(0.4)} ${r(0.4)} 0 1 1 ${r(1.4)} ${r(0.82)} C ${r(1.4)} ${r(1.04)} ${r(1.26)} ${r(1.24)} ${r(1)} ${r(1.56)} Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 ${d} ${d}"><circle cx="${raio}" cy="${raio}" r="${raio}" fill="${fundo}"/><path d="${pino}" fill="${traco}"/><circle cx="${raio}" cy="${r(0.82)}" r="${r(0.15)}" fill="${fundo}"/></svg>`;
}

export function iconeSeloSvg(icone: IconeSelo | undefined, raio: number, fundo: string, traco: string): string {
  return icone === "local" ? iconePinoSvg(raio, fundo, traco) : iconeCheckSvg(raio, fundo, traco);
}

/** Cores do selo: laranja com texto branco, ou branco com texto verde-azulado. */
export function coresSelo(estilo: ElementoSelo["estilo"]): { fundo: string; texto: string } {
  return estilo === "laranja" ? { fundo: CORES_MARCA.laranja, texto: CORES_MARCA.branco } : { fundo: CORES_MARCA.branco, texto: CORES_MARCA.teal };
}

/** Escalas da foto na caixa: cobrir (zoom 1) e caber inteira (o menor zoom). */
function escalasDaFoto(foto: { largura: number; altura: number }, box: FotoArte["box"]) {
  const w = Math.round(box[2] - box[0]);
  const h = Math.round(box[3] - box[1]);
  return { w, h, cobrir: Math.max(w / foto.largura, h / foto.altura), caber: Math.min(w / foto.largura, h / foto.altura) };
}

/** O menor zoom da foto nessa caixa: a foto inteira aparece (o resto é fundo desfocado). */
export function zoomMinimo(foto: { largura: number; altura: number }, box: FotoArte["box"]): number {
  const { cobrir, caber } = escalasDaFoto(foto, box);
  return caber / cobrir;
}

/**
 * Como a foto entra na caixa, sem distorcer — o mesmo cálculo no servidor
 * (sharp) e na prévia do editor (CSS). Em cada sentido: se a foto ampliada é
 * maior que a caixa, recorta no ponto focal (left/top); se é menor (zoom < 1,
 * desde 26/10), aparece inteira nesse sentido, posicionada pelo ponto focal
 * (dx/dy), e o fundo é a própria foto desfocada (preenche = false).
 */
export function recorteDaFoto(foto: { largura: number; altura: number }, f: Pick<FotoArte, "box" | "fx" | "fy" | "zoom">) {
  const { w, h, cobrir, caber } = escalasDaFoto(foto, f.box);
  const escala = Math.max(caber, cobrir * (f.zoom || 1));
  // Arredondamento não pode abrir uma fresta de 1 px quando a foto cobre a caixa.
  const ajustar = (r: number, c: number) => (r < c && r >= c - 1 ? c : r);
  const rw = ajustar(Math.round(foto.largura * escala), w);
  const rh = ajustar(Math.round(foto.altura * escala), h);
  const eixo = (r: number, c: number, foco: number) =>
    r >= c ? { corte: Math.min(Math.max(Math.round(r * foco - c / 2), 0), r - c), desloc: 0 } : { corte: 0, desloc: Math.round((c - r) * Math.min(Math.max(foco, 0), 1)) };
  const x = eixo(rw, w, f.fx);
  const y = eixo(rh, h, f.fy);
  return { w, h, rw, rh, left: x.corte, top: y.corte, dx: x.desloc, dy: y.desloc, preenche: rw >= w && rh >= h };
}

/**
 * Onde a foto pode mostrar os brinquedos sem nada por cima: a caixa da foto
 * menos a faixa da logo (embaixo) e, se ainda sobrar espaço bom, menos a
 * faixa do título e dos selos (em cima). Em pixels da arte.
 */
export function areaSeguraDaFoto(dados: Pick<DadosArte, "elementos">, box: FotoArte["box"]): [number, number, number, number] {
  const [x0, , x1] = box;
  let [, y0, , y1] = box;
  const altura = y1 - y0;
  for (const e of dados.elementos) {
    if (e.tipo !== "logo") continue;
    const topoLogo = e.base - e.larg * LOGO_PROPORCAO;
    if (topoLogo > y0 + altura / 2 && topoLogo < y1) y1 = Math.min(y1, topoLogo - 12);
  }
  let fimTextos = y0;
  for (const e of dados.elementos) {
    if (e.tipo === "titulo") fimTextos = Math.max(fimTextos, e.y + alturaTitulo(e.linhas, e.escala || 1));
    if (e.tipo === "selo") fimTextos = Math.max(fimTextos, e.y + alturaSelo(e.tam));
  }
  // Textos na metade de cima e ainda sobra pelo menos 45% da caixa: os brinquedos ficam abaixo deles.
  if (fimTextos > y0 && fimTextos < y0 + altura / 2 && y1 - (fimTextos + 16) >= altura * 0.45) y0 = fimTextos + 16;
  return [x0, y0, x1, y1];
}

/** Caixa de brinquedos vinda de fora (editor, assistente): 4 números de 0 a 1, em ordem. */
export function alvoValido(v: unknown): AlvoFoto | null {
  if (!Array.isArray(v) || v.length !== 4 || !v.every((n) => typeof n === "number" && n >= 0 && n <= 1)) return null;
  const [x0, y0, x1, y1] = v as number[];
  return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null;
}

/** Folga em volta dos brinquedos (da largura/altura da foto), pra não ficarem colados na borda. */
const FOLGA_ALVO = 0.03;

/**
 * Ponto focal e zoom pra os brinquedos (alvo) aparecerem inteiros na área
 * segura: o maior zoom (até cobrir a caixa, nunca ampliar além) em que eles
 * cabem, com eles no meio da área. Foto larga demais pro slide: diminui até
 * caber (zoom < 1), com fundo desfocado.
 */
export function enquadrarNoAlvo(
  foto: { largura: number; altura: number },
  box: FotoArte["box"],
  alvo: AlvoFoto,
  seguro: [number, number, number, number] = box,
): Pick<FotoArte, "fx" | "fy" | "zoom"> {
  const { w, h, cobrir, caber } = escalasDaFoto(foto, box);
  const ax0 = Math.max(seguro[0] - box[0], 0);
  const ay0 = Math.max(seguro[1] - box[1], 0);
  const ax1 = Math.min(seguro[2] - box[0], w);
  const ay1 = Math.min(seguro[3] - box[1], h);
  const bx0 = Math.max(alvo[0] - FOLGA_ALVO, 0);
  const by0 = Math.max(alvo[1] - FOLGA_ALVO, 0);
  const bx1 = Math.min(alvo[2] + FOLGA_ALVO, 1);
  const by1 = Math.min(alvo[3] + FOLGA_ALVO, 1);
  const cabe = Math.min((ax1 - ax0) / Math.max((bx1 - bx0) * foto.largura, 1), (ay1 - ay0) / Math.max((by1 - by0) * foto.altura, 1));
  const escala = Math.min(Math.max(Math.min(cobrir, cabe), caber), cobrir);
  const rw = foto.largura * escala;
  const rh = foto.altura * escala;
  // Foto maior que a caixa: centro dos brinquedos no centro da área segura,
  // sem sair da foto. Foto menor (sobra fundo): fica no meio da caixa, e só
  // sobe/desce o necessário pra os brinquedos não irem pra trás da logo ou do título.
  const foco = (r: number, c: number, b0: number, b1: number, a0: number, a1: number) => {
    if (r > c + 0.5) return (Math.min(Math.max(((b0 + b1) / 2) * r - (a0 + a1) / 2, 0), r - c) + c / 2) / r;
    if (r < c - 0.5) {
      const min = Math.max(a0 - b0 * r, 0);
      const max = Math.min(a1 - b1 * r, c - r);
      const desloc = min <= max ? Math.min(Math.max((c - r) / 2, min), max) : Math.min(Math.max((a0 + a1) / 2 - ((b0 + b1) / 2) * r, 0), c - r);
      return desloc / (c - r);
    }
    return 0.5;
  };
  const arred = (v: number) => Math.round(v * 1000) / 1000;
  return {
    fx: arred(foco(rw, w, bx0, bx1, ax0, ax1)),
    fy: arred(foco(rh, h, by0, by1, ay0, ay1)),
    zoom: arred(escala / cobrir),
  };
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
export function elementosDaCapa(formato: FormatoArte, titulo: [string, string], selos: SeloPedido[]): ElementoArte[] {
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
    .map((s) => (typeof s === "string" ? { t: comMaiuscula(s), icone: undefined } : { t: comMaiuscula(s.t), icone: s.icone }))
    .filter((s) => s.t)
    .slice(0, 2)
    .forEach(({ t, icone }, i) => {
      elementos.push({ id: `selo${i + 1}`, tipo: "selo", x: X_TEXTOS, y, t, tam: m.tamSelo, estilo: i === 0 ? "laranja" : "branco", ...(icone === "local" && { icone }) });
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

function capa(formato: FormatoArte, foto: FotoDoPost, titulo: [string, string], selos: SeloPedido[]): DadosArte {
  const { w, h } = TAMANHO_ARTE[formato];
  return { w, h, fotos: [{ imagemId: foto.id, box: caixaInteira(formato), fx: 0.5, fy: formato === "FEED" ? 0.42 : 0.5, zoom: 1 }], elementos: elementosDaCapa(formato, titulo, selos) };
}

export type ArteMontada = { formato: FormatoArte; dados: DadosArte };

export type PedidoArtes = {
  conteudo: ConteudoPostagem;
  fotos: FotoDoPost[];
  /** Linha pequena e linha grande do título. */
  titulo: [string, string];
  selos: SeloPedido[];
  /** Benefícios: um argumento por slide. */
  argumentos?: string[];
  /** Entrega: 2 fotos empilhadas por slide (padrão) ou 1 foto por slide. */
  fotosPorSlide?: FotosPorSlide;
};

export type FotosPorSlide = 1 | 2;

/** Carrossel tem no máximo 10 itens (capa + 9). */
export const MAX_CARROSSEL = 10;

/**
 * Fotos dos slides de uma entrega, fora a da capa. Com 2 por slide, as
 * deitadas vão primeiro (ficam melhores empilhadas); com 1 por slide, na
 * ordem em que vieram (pedido do Marcos de 2026-10-21: "um slide pra cada
 * foto"). No máximo 9 slides (carrossel de 10 com a capa).
 */
export function slidesDasFotos(fotos: FotoDoPost[], capaId: string, porSlide: FotosPorSlide): { slides: DadosArte[]; foraDoCarrossel: number } {
  const resto = fotos.filter((f) => f.id !== capaId);
  const ordem = porSlide === 2 ? [...resto.filter((f) => !vertical(f)), ...resto.filter(vertical)] : resto;
  const slides: DadosArte[] = [];
  let usadas = 0;
  for (let i = 0; i < ordem.length && slides.length < MAX_CARROSSEL - 1; i += porSlide) {
    const grupo = ordem.slice(i, i + porSlide);
    slides.push(slide(grupo));
    usadas += grupo.length;
  }
  return { slides, foraDoCarrossel: ordem.length - usadas };
}

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
      // Slides: 2 fotos empilhadas (padrão) ou 1 por slide.
      for (const dados of slidesDasFotos(p.fotos, principal.id, p.fotosPorSlide ?? 2).slides) artes.push({ formato: "FEED", dados });
      artes.push(story());
      return artes;
    }
  }
}

/** Textos das artes de um post (Postagem.textos). */
export type TextosPostagem = {
  titulo: [string, string];
  selos: string[];
  preco?: string | null;
  argumentos?: string[];
  local?: string | null;
  /** Entrega: fotos por slide do carrossel (padrão 2). */
  fotosPorSlide?: FotosPorSlide;
};

/**
 * Selos das artes com o selo de localização: o local entra no lugar do
 * segundo selo (no máximo 3 informações por imagem: título + 2 selos).
 */
export function selosComLocal(selos: string[], local?: string | null): SeloPedido[] {
  const lugar = local?.trim();
  const comTexto = selos.map((s) => s.trim()).filter(Boolean);
  return lugar ? [...comTexto.slice(0, 1), { t: lugar, icone: "local" }] : comTexto.slice(0, 2);
}

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

const limitar = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return Math.min(Math.max(Number.isFinite(n) ? n : min, min), max);
};
const TEXTO_MAX = 40;
const CORES_TITULO = ["teal", "laranja"] as const;

/**
 * O que o editor manda salvar, conferido contra a arte guardada (etapa 2,
 * 2026-10-17): as caixas das fotos não mudam (só qual foto, ponto focal e
 * zoom), a logo só muda de tamanho e posição e nunca some, no máximo título
 * + 2 selos (3 informações), cores só da marca, textos com maiúscula e tudo
 * dentro da arte.
 */
export function sanitizarDadosArte(
  guardada: DadosArte,
  enviada: Partial<DadosArte>,
  imagensDoPost: string[],
  /** Onde estão os brinquedos, descoberto no servidor (o que vem do navegador não vale). */
  alvosDoServidor?: Map<string, AlvoFoto | null>,
): DadosArte {
  const { w, h } = guardada;
  const fotos: FotoArte[] = guardada.fotos.map((g, i) => {
    const e = enviada.fotos?.[i];
    const imagemId = e && imagensDoPost.includes(e.imagemId) ? e.imagemId : g.imagemId;
    const alvo = alvosDoServidor?.get(imagemId) ?? (imagemId === g.imagemId ? g.alvo : undefined);
    return {
      imagemId,
      box: g.box,
      fx: limitar(e?.fx ?? g.fx, 0, 1),
      fy: limitar(e?.fy ?? g.fy, 0, 1),
      // Abaixo de 1 a foto diminui até caber inteira (recorteDaFoto não deixa passar disso).
      zoom: limitar(e?.zoom ?? g.zoom, 0.1, 4),
      // Onde estão os brinquedos é da foto: só vale enquanto for a mesma foto.
      ...(alvo ? { alvo } : {}),
    };
  });

  const enviados = Array.isArray(enviada.elementos) ? enviada.elementos : [];
  const elementos: ElementoArte[] = [];
  const titulo = enviados.find((x): x is ElementoTitulo => x?.tipo === "titulo");
  if (titulo && Array.isArray(titulo.linhas)) {
    const linhas = titulo.linhas
      .slice(0, 2)
      .map((l, i): LinhaTitulo => ({
        t: comMaiuscula(String(l?.t ?? "").slice(0, TEXTO_MAX)),
        tam: Math.round(limitar(l?.tam, 20, 160)),
        cor: (CORES_TITULO as readonly string[]).includes(l?.cor) ? l.cor : i === 0 ? "teal" : "laranja",
      }))
      .filter((l) => l.t);
    if (linhas.length) {
      elementos.push({ id: "titulo", tipo: "titulo", x: Math.round(limitar(titulo.x, 0, w - 40)), y: Math.round(limitar(titulo.y, 0, h - 40)), escala: limitar(titulo.escala, 0.5, 2), linhas });
    }
  }
  enviados
    .filter((x): x is ElementoSelo => x?.tipo === "selo")
    .map((s) => ({ ...s, t: comMaiuscula(String(s.t ?? "").slice(0, TEXTO_MAX)) }))
    .filter((s) => s.t)
    .slice(0, 2)
    .forEach((s, i) => {
      elementos.push({
        id: `selo${i + 1}`,
        tipo: "selo",
        x: Math.round(limitar(s.x, 0, w - 40)),
        y: Math.round(limitar(s.y, 0, h - 40)),
        t: s.t,
        tam: Math.round(limitar(s.tam, 18, 48)),
        estilo: s.estilo === "branco" ? "branco" : "laranja",
        ...(s.icone === "local" && { icone: "local" as const }),
      });
    });
  const logo = enviados.find((x): x is ElementoLogo => x?.tipo === "logo") ?? guardada.elementos.find((x): x is ElementoLogo => x.tipo === "logo");
  if (logo) {
    const larg = Math.round(limitar(logo.larg, 120, 640));
    const altura = larg * LOGO_PROPORCAO;
    elementos.push({ id: "logo", tipo: "logo", larg, cx: Math.round(limitar(logo.cx, larg / 2, w - larg / 2)), base: Math.round(limitar(logo.base, altura, h)) });
  }
  return { w, h, fotos, elementos };
}

/** Story: o que fica nos 250 px de cima ou de baixo (onde ficam os botões do Instagram). */
export const MARGEM_STORY = 250;

const SELOS_PADRAO = ["Diversão Garantida", "Qualidade e Segurança"];

/**
 * Selo novo numa arte (editor ou assistente): logo abaixo do último selo, ou
 * abaixo do título, no estilo que ainda não existe (laranja primeiro) e com
 * um texto padrão que ainda não está na arte.
 */
export function seloNovo(dados: DadosArte, formato: FormatoArte, texto?: string, icone?: IconeSelo): ElementoSelo {
  const selos = dados.elementos.filter((e): e is ElementoSelo => e.tipo === "selo");
  const titulo = dados.elementos.find((e): e is ElementoTitulo => e.tipo === "titulo");
  const m = MEDIDAS[formato];
  const ultimo = selos.at(-1);
  const y = ultimo
    ? ultimo.y + alturaSelo(ultimo.tam) + 12
    : titulo
      ? titulo.y + alturaTitulo(titulo.linhas, titulo.escala) + m.gapSelo
      : m.tituloY;
  return {
    id: `selo${selos.length + 1}`,
    tipo: "selo",
    x: titulo?.x ?? X_TEXTOS,
    y: Math.round(y),
    t: comMaiuscula(texto ?? "") || (SELOS_PADRAO.find((t) => !selos.some((s) => s.t === t)) ?? "Novo selo"),
    tam: m.tamSelo,
    estilo: selos.some((s) => s.estilo === "laranja") ? "branco" : "laranja",
    ...(icone === "local" && { icone }),
  };
}

/** Título padrão de uma arte que não tinha (ex.: slide), na posição do padrão. */
export function tituloNovo(formato: FormatoArte, linhas: [string, string]): ElementoTitulo | null {
  const t = elementosDaCapa(formato, linhas, []).find((e): e is ElementoTitulo => e.tipo === "titulo");
  return t ?? null;
}

/** Enquadra nos brinquedos as fotos da arte cujo alvo já se sabe (as outras ficam como estão). */
export function enquadrarArte(dados: DadosArte, fotos: Map<string, { largura: number; altura: number }>, alvos: Map<string, AlvoFoto | null>): DadosArte {
  return {
    ...dados,
    fotos: dados.fotos.map((f) => {
      const alvo = alvos.get(f.imagemId);
      const dim = fotos.get(f.imagemId);
      return alvo && dim ? { ...f, alvo, ...enquadrarNoAlvo(dim, f.box, alvo, areaSeguraDaFoto(dados, f.box)) } : f;
    }),
  };
}
