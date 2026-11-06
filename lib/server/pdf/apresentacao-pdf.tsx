import "server-only";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { Document, Font, Image, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import { centavosParaReais } from "@/lib/utils/money";
import {
  subtotalCentavos,
  totalCentavos,
  type OrcamentoParaApresentacao,
  type PaginaApresentacao,
  type PaginaDoTipo,
} from "@/lib/utils/apresentacao";

// PDF da apresentação do orçamento (16:9, 960x540 pt) no visual da
// "Apresentação Legaus Kids": portfólio, clientes e ecossistema são as
// próprias páginas do modelo (public/apresentacao); as outras são montadas
// aqui com as fontes da marca, o rodapé e o logo recortados do modelo.
// Medidas tiradas do PDF original (mesmo tamanho de página).

const PASTA = path.join(process.cwd(), "public", "apresentacao");
const FONTES = path.join(process.cwd(), "public", "fontes-marca");
const ler = (arquivo: string) => fs.readFileSync(path.join(PASTA, arquivo));
const RODAPE = ler("rodape.jpg");
const LOGO = ler("logo-capa.jpg");
const PAGINA_FIXA = { portfolio: ler("portfolio.jpg"), clientes: ler("clientes.jpg"), ecossistema: ler("ecossistema.jpg") };

Font.register({ family: "Baloo", src: path.join(FONTES, "Baloo2-ExtraBold.ttf") });
Font.register({
  family: "Nunito",
  fonts: [
    { src: path.join(FONTES, "Nunito-Regular.ttf"), fontWeight: 400 },
    { src: path.join(FONTES, "Nunito-Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
    { src: path.join(FONTES, "Nunito-Bold.ttf"), fontWeight: 700 },
    { src: path.join(FONTES, "Nunito-ExtraBold.ttf"), fontWeight: 800 },
  ],
});

const cor = { teal: "#0aa99e", laranja: "#f74d1e", creme: "#fff6f1", texto: "#2b2b2b", cinza: "#7a7a7a", linha: "#f1e6e0", branco: "#ffffff" };

const W = 960;
const H = 540;
const M = 64;
const LARGURA_UTIL = W - 2 * M;
const TOPO = 104;
const BASE = 465;

type Caixa = { left: number; top: number; width: number; height: number };
type Foto = { src: Buffer; width: number; height: number };

// Sem hifenização: a padrão do react-pdf é em inglês e quebra palavras em português no lugar errado.
const semHifen = (palavra: string) => [palavra];

function T({ style, children }: { style?: Style | Style[]; children: React.ReactNode }) {
  return (
    <Text hyphenationCallback={semHifen} style={style}>
      {children}
    </Text>
  );
}

/** Fonte menor quanto maior o texto: [[até N caracteres, tamanho], ...]. */
function tamanho(texto: string, faixas: [number, number][], menor: number): number {
  return faixas.find(([limite]) => texto.length <= limite)?.[1] ?? menor;
}

// ---------------------------------------------------------------------------
// Imagens: reduzidas pro tamanho do espaço (2 px por pt) — o PDF fica leve
// pra ir pelo WhatsApp e cabe no limite de resposta da Vercel. Se mesmo assim
// passar, gerarPdfApresentacao refaz com NITIDEZ_LEVE.
// ---------------------------------------------------------------------------

export type Nitidez = { escala: number; qualidade: number };
export const NITIDEZ_NORMAL: Nitidez = { escala: 2, qualidade: 82 };
export const NITIDEZ_LEVE: Nitidez = { escala: 1.25, qualidade: 70 };

async function cobrir(imagem: Buffer, caixa: Caixa, n: Nitidez): Promise<Foto | null> {
  try {
    const src = await sharp(imagem)
      .rotate()
      .resize(Math.round(caixa.width * n.escala), Math.round(caixa.height * n.escala), { fit: "cover" })
      .jpeg({ quality: n.qualidade })
      .toBuffer();
    return { src, width: caixa.width, height: caixa.height };
  } catch {
    return null;
  }
}

async function caber(imagem: Buffer, caixa: Caixa, n: Nitidez): Promise<Foto | null> {
  try {
    const { data, info } = await sharp(imagem)
      .rotate()
      .flatten({ background: cor.branco })
      .resize(Math.round(caixa.width * n.escala), Math.round(caixa.height * n.escala), { fit: "inside" })
      .jpeg({ quality: n.qualidade + 2 })
      .toBuffer({ resolveWithObject: true });
    return { src: data, width: info.width / n.escala, height: info.height / n.escala };
  } catch {
    return null;
  }
}

const RAIO = 10;

function Fotografia({ foto, caixa, fundo }: { foto: Foto | null; caixa: Caixa; fundo?: string }) {
  if (!foto) return null;
  return (
    <View style={{ position: "absolute", ...caixa, alignItems: "center", justifyContent: "center", backgroundColor: fundo, borderRadius: RAIO }}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- Image aqui é do @react-pdf/renderer (destino é PDF), não HTML img */}
      <Image src={foto.src} style={{ width: foto.width, height: foto.height, borderRadius: fundo ? 0 : RAIO }} />
    </View>
  );
}

// Espaços das fotos em cada página.
function caixasProjeto(n: number): Caixa[] {
  if (n <= 1) return [{ left: M, top: 44, width: 519, height: 421 }];
  if (n === 2) return [{ left: M, top: 44, width: 519, height: 259 }, { left: M, top: 316, width: 519, height: 149 }];
  return [
    { left: M, top: 44, width: 519, height: 259 },
    { left: M, top: 316, width: 253, height: 149 },
    { left: 330, top: 316, width: 253, height: 149 },
  ];
}

const linhasGaleria = (texto: string) => (texto.trim() ? Math.min(3, Math.ceil(texto.trim().length / 110)) : 0);

function caixasGaleria(n: number, texto: string): Caixa[] {
  const top = TOPO + linhasGaleria(texto) * 22;
  const altura = BASE - top;
  const meia = (LARGURA_UTIL - 14) / 2;
  if (n <= 1) return [{ left: M, top, width: LARGURA_UTIL, height: altura }];
  if (n === 2) return [{ left: M, top, width: meia, height: altura }, { left: M + meia + 14, top, width: meia, height: altura }];
  const metadeAltura = (altura - 14) / 2;
  if (n === 3) {
    const grande = 540;
    const lado = LARGURA_UTIL - grande - 14;
    return [
      { left: M, top, width: grande, height: altura },
      { left: M + grande + 14, top, width: lado, height: metadeAltura },
      { left: M + grande + 14, top: top + metadeAltura + 14, width: lado, height: metadeAltura },
    ];
  }
  return [0, 1, 2, 3].map((i) => ({ left: M + (i % 2) * (meia + 14), top: top + Math.floor(i / 2) * (metadeAltura + 14), width: meia, height: metadeAltura }));
}

const CAIXA_MODELO: Caixa = { left: M, top: TOPO, width: 519, height: BASE - TOPO };
const CAIXA_INFO_IMAGEM: Caixa = { left: 488, top: TOPO, width: 408, height: BASE - TOPO };

export type PaginaPronta = { pagina: PaginaApresentacao; fotos: (Foto | null)[] };

/**
 * Encaixa as imagens de cada página no espaço dela. `imagens` = enviadas pra
 * apresentação (por id); `fotoDoItem` = foto do produto do item do orçamento.
 */
export async function prepararPaginas(
  paginas: PaginaApresentacao[],
  imagens: Map<string, Buffer>,
  fotoDoItem: (indice: number) => Buffer | null,
  n: Nitidez = NITIDEZ_NORMAL,
): Promise<PaginaPronta[]> {
  return Promise.all(
    paginas.map(async (pagina): Promise<PaginaPronta> => {
      const escolhidas = "imagens" in pagina ? pagina.imagens.flatMap((id) => imagens.get(id) ?? []) : [];
      switch (pagina.tipo) {
        case "projeto": {
          const caixas = caixasProjeto(escolhidas.length);
          return { pagina, fotos: await Promise.all(escolhidas.map((img, i) => cobrir(img, caixas[i], n))) };
        }
        case "galeria": {
          const caixas = caixasGaleria(escolhidas.length, pagina.texto);
          return { pagina, fotos: await Promise.all(escolhidas.map((img, i) => (pagina.inteira ? caber : cobrir)(img, caixas[i], n))) };
        }
        case "modelo": {
          const imagem = escolhidas[0] ?? fotoDoItem(pagina.item);
          const interna = { ...CAIXA_MODELO, width: CAIXA_MODELO.width - 28, height: CAIXA_MODELO.height - 28 };
          return { pagina, fotos: imagem ? [await caber(imagem, interna, n)] : [] };
        }
        case "informacoes":
          return { pagina, fotos: escolhidas[0] ? [await cobrir(escolhidas[0], CAIXA_INFO_IMAGEM, n)] : [] };
        default:
          return { pagina, fotos: [] };
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------------

function Folha({ children, fundo = cor.creme, rodape = true }: { children: React.ReactNode; fundo?: string; rodape?: boolean }) {
  return (
    <Page size={[W, H]} style={{ backgroundColor: fundo, fontFamily: "Nunito", color: cor.texto, position: "relative" }}>
      {children}
      {rodape && (
        // eslint-disable-next-line jsx-a11y/alt-text -- Image aqui é do @react-pdf/renderer (destino é PDF), não HTML img
        <Image src={RODAPE} style={{ position: "absolute", left: 0, top: 485, width: W, height: H - 485 }} />
      )}
    </Page>
  );
}

function Titulo({ children }: { children: string }) {
  return <T style={{ position: "absolute", left: M, top: 30, width: LARGURA_UTIL, fontFamily: "Baloo", fontSize: 40, color: cor.laranja }}>{children}</T>;
}

function Capa({ p }: { p: PaginaDoTipo<"capa"> }) {
  return (
    <Folha fundo={cor.teal} rodape={false}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- Image aqui é do @react-pdf/renderer (destino é PDF), não HTML img */}
      <Image src={LOGO} style={{ position: "absolute", left: 270, top: 85, width: 420, height: 260 }} />
      <View style={{ position: "absolute", left: M, top: 366, width: LARGURA_UTIL, alignItems: "center" }}>
        {p.titulo && <T style={{ fontFamily: "Baloo", fontSize: 46, color: cor.branco, textAlign: "center" }}>{p.titulo}</T>}
        {p.subtitulo && <T style={{ fontWeight: 800, fontSize: 22, marginTop: 4, textAlign: "center" }}>{p.subtitulo}</T>}
        {p.proposta && (
          <View style={{ marginTop: 18, backgroundColor: cor.branco, borderRadius: 18, paddingVertical: 7, paddingHorizontal: 20 }}>
            <T style={{ fontWeight: 800, fontSize: 15, color: cor.teal }}>{p.proposta}</T>
          </View>
        )}
      </View>
    </Folha>
  );
}

function Sobre({ p }: { p: PaginaDoTipo<"sobre"> }) {
  const numeros = p.numeros.filter((n) => n.valor.trim());
  const alturaCards = numeros.length > 0 ? 309 : BASE - 44;
  const cartao = (left: number, fundo: string, titulo: string, textoCartao: string) => (
    <View style={{ position: "absolute", left, top: 44, width: 408, height: alturaCards, backgroundColor: fundo, borderRadius: 12, paddingHorizontal: 25, paddingTop: 22 }}>
      <T style={{ fontFamily: "Baloo", fontSize: 38, color: cor.branco }}>{titulo}</T>
      <T style={{ fontWeight: 800, fontSize: tamanho(textoCartao, [[170, 20], [260, 17], [360, 15]], 13), color: cor.branco, lineHeight: 1.38, marginTop: 2 }}>{textoCartao}</T>
    </View>
  );
  const largura = (LARGURA_UTIL - (numeros.length - 1) * 17) / Math.max(1, numeros.length);
  return (
    <Folha>
      {cartao(M, cor.teal, "Quem somos", p.quemSomos)}
      {cartao(488, cor.laranja, "O que fazemos", p.oQueFazemos)}
      {numeros.map((n, i) => (
        <View key={i} style={{ position: "absolute", left: M + i * (largura + 17), top: 369, width: largura, height: 96, backgroundColor: cor.branco, borderRadius: 12, paddingHorizontal: 20, paddingTop: 12 }}>
          <T style={{ fontFamily: "Baloo", fontSize: 34, color: cor.laranja }}>{n.valor}</T>
          <T style={{ fontSize: 16, marginTop: -4 }}>{n.rotulo}</T>
        </View>
      ))}
    </Folha>
  );
}

function PaginaFixa({ tipo }: { tipo: keyof typeof PAGINA_FIXA }) {
  return (
    <Page size={[W, H]}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- Image aqui é do @react-pdf/renderer (destino é PDF), não HTML img */}
      <Image src={PAGINA_FIXA[tipo]} style={{ width: W, height: H }} />
    </Page>
  );
}

function ComoFunciona({ p }: { p: PaginaDoTipo<"como-funciona"> }) {
  const etapas = p.etapas.filter((e) => e.titulo.trim());
  const gap = 12;
  const largura = (LARGURA_UTIL - (etapas.length - 1) * gap) / Math.max(1, etapas.length);
  const fonte = largura < 140 ? 12 : 13.5;
  return (
    <Folha>
      <Titulo>{p.titulo || "Como funciona"}</Titulo>
      {etapas.map((e, i) => (
        <View key={i} style={{ position: "absolute", left: M + i * (largura + gap), top: 120, width: largura, height: BASE - 120, backgroundColor: cor.branco, borderRadius: 12, paddingHorizontal: 16, paddingTop: 14 }}>
          <T style={{ fontFamily: "Baloo", fontSize: 40, color: cor.teal }}>{String(i + 1)}</T>
          <T style={{ fontWeight: 800, fontSize: 17, marginTop: 6 }}>{e.titulo}</T>
          {e.texto && <T style={{ fontSize: fonte, lineHeight: 1.45, marginTop: 10 }}>{e.texto}</T>}
        </View>
      ))}
    </Folha>
  );
}

function LinhaRotulada({ rotulo, valor, tamanhoFonte = 15 }: { rotulo: string; valor: string; tamanhoFonte?: number }) {
  return (
    <T style={{ fontSize: tamanhoFonte, lineHeight: 1.4 }}>
      <Text style={{ fontWeight: 800 }}>{rotulo}: </Text>
      {valor}
    </T>
  );
}

function Projeto({ p, fotos }: { p: PaginaDoTipo<"projeto">; fotos: (Foto | null)[] }) {
  const caixas = caixasProjeto(fotos.length);
  const comFoto = fotos.length > 0;
  const textoTotal = p.entregamos + p.ambiente + p.depoimento;
  const fonte = tamanho(textoTotal, [[260, 15], [480, 13.5]], 12);
  return (
    <Folha>
      {fotos.map((foto, i) => (
        <Fotografia key={i} foto={foto} caixa={caixas[i]} />
      ))}
      <View style={{ position: "absolute", left: comFoto ? 608 : M, top: 44, width: comFoto ? 288 : LARGURA_UTIL, height: BASE - 44 }}>
        <View style={{ alignSelf: "flex-start", backgroundColor: cor.branco, borderRadius: 14, paddingVertical: 5, paddingHorizontal: 13 }}>
          <T style={{ fontWeight: 800, fontSize: 13 }}>Projeto realizado</T>
        </View>
        {p.cliente && <T style={{ fontFamily: "Baloo", fontSize: tamanho(p.cliente, [[22, 32], [40, 26]], 22), color: cor.laranja, marginTop: 8, lineHeight: 1.1 }}>{p.cliente}</T>}
        {p.local && <T style={{ fontWeight: 800, fontSize: 15, marginTop: 8 }}>{p.local}</T>}
        <View style={{ marginTop: 12, gap: 10 }}>
          {p.entregamos && <LinhaRotulada rotulo="O que entregamos" valor={p.entregamos} tamanhoFonte={fonte} />}
          {p.ambiente && <LinhaRotulada rotulo="Ambiente" valor={p.ambiente} tamanhoFonte={fonte} />}
        </View>
        {p.depoimento && (
          <View style={{ marginTop: 16, backgroundColor: cor.branco, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: cor.laranja, paddingVertical: 12, paddingHorizontal: 14 }}>
            <T style={{ fontStyle: "italic", fontSize: fonte - 1, lineHeight: 1.4 }}>“{p.depoimento}”</T>
          </View>
        )}
      </View>
    </Folha>
  );
}

function Modelo({ p, fotos }: { p: PaginaDoTipo<"modelo">; fotos: (Foto | null)[] }) {
  const foto = fotos[0] ?? null;
  const linhas = [
    { rotulo: "Modelo", valor: p.modelo },
    { rotulo: "Dimensões", valor: p.dimensoes },
    { rotulo: "Itens inclusos", valor: p.itens },
    { rotulo: "Prazo", valor: p.prazo },
  ].filter((l) => l.valor.trim());
  const textoTotal = linhas.map((l) => l.valor).join("");
  const fonte = tamanho(textoTotal, [[200, 15], [380, 13], [520, 11.5]], 10.5);
  const investimento = p.mostrarInvestimento && p.investimento.trim();
  return (
    <Folha>
      <Titulo>{p.titulo || "O modelo para o seu espaço"}</Titulo>
      {foto && (
        <View style={{ position: "absolute", ...CAIXA_MODELO, backgroundColor: cor.branco, borderRadius: 12, alignItems: "center", justifyContent: "center" }}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image aqui é do @react-pdf/renderer (destino é PDF), não HTML img */}
          <Image src={foto.src} style={{ width: foto.width, height: foto.height }} />
        </View>
      )}
      <View
        style={{
          position: "absolute",
          left: foto ? 604 : M,
          top: TOPO,
          width: foto ? 292 : LARGURA_UTIL,
          height: BASE - TOPO,
          backgroundColor: cor.branco,
          borderRadius: 12,
          paddingHorizontal: 22,
          paddingVertical: 20,
          justifyContent: "space-around",
        }}
      >
        {linhas.map((l) => (
          <LinhaRotulada key={l.rotulo} rotulo={l.rotulo} valor={l.valor} tamanhoFonte={fonte} />
        ))}
        {investimento && (
          <T style={{ fontSize: fonte, lineHeight: 1.4 }}>
            <Text style={{ fontWeight: 800 }}>Investimento: </Text>
            <Text style={{ fontWeight: 800, color: cor.laranja, fontSize: fonte + 3 }}>{p.investimento}</Text>
          </T>
        )}
      </View>
    </Folha>
  );
}

const MAX_LINHAS_INVESTIMENTO = 14;

function Investimento({ p, orcamento }: { p: PaginaDoTipo<"investimento">; orcamento: OrcamentoParaApresentacao }) {
  const itens = orcamento.itens.slice(0, MAX_LINHAS_INVESTIMENTO);
  const restantes = orcamento.itens.length - itens.length;
  const fonte = itens.length <= 5 ? 14 : itens.length <= 9 ? 12 : 10;
  const condicoes = [orcamento.observacoes?.trim(), p.texto.trim()].filter(Boolean).join("\n");
  const colunas = { item: { flex: 5 }, qtd: { width: 60, textAlign: "right" as const }, unit: { width: 120, textAlign: "right" as const }, sub: { width: 130, textAlign: "right" as const } };
  const cabecalho = { fontWeight: 800, fontSize: 10, color: cor.cinza, textTransform: "uppercase" as const, letterSpacing: 0.5 };
  return (
    <Folha>
      <Titulo>{p.titulo || "Investimento"}</Titulo>
      <View style={{ position: "absolute", left: M, top: TOPO, width: LARGURA_UTIL, height: BASE - TOPO, backgroundColor: cor.branco, borderRadius: 12, paddingHorizontal: 26, paddingVertical: 20 }}>
        <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: cor.linha, paddingBottom: 6 }}>
          <T style={[colunas.item, cabecalho]}>Item</T>
          <T style={[colunas.qtd, cabecalho]}>Qtd.</T>
          <T style={[colunas.unit, cabecalho]}>Valor unit.</T>
          <T style={[colunas.sub, cabecalho]}>Total</T>
        </View>
        {itens.map((item, i) => (
          <View key={i} style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: cor.linha, paddingVertical: fonte <= 10 ? 3 : 6, fontSize: fonte }}>
            <T style={colunas.item}>{item.nome}</T>
            <T style={colunas.qtd}>{String(item.quantidade)}</T>
            <T style={colunas.unit}>{centavosParaReais(item.valorUnitarioCentavos)}</T>
            <T style={[colunas.sub, { fontWeight: 700 }]}>{centavosParaReais(item.quantidade * item.valorUnitarioCentavos)}</T>
          </View>
        ))}
        {restantes > 0 && <T style={{ fontSize: fonte, color: cor.cinza, paddingVertical: 4 }}>… e mais {restantes} {restantes === 1 ? "item" : "itens"}</T>}
        <View style={{ flexGrow: 1 }} />
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 24 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <T style={{ fontWeight: 800, fontSize: 13 }}>Proposta válida até {orcamento.validoAte}.</T>
            {condicoes && <T style={{ fontSize: tamanho(condicoes, [[220, 12], [500, 10.5]], 9), lineHeight: 1.35, color: "#555555" }}>{condicoes}</T>}
          </View>
          <View style={{ width: 250, gap: 3 }}>
            {orcamento.descontoCentavos > 0 && (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <T style={{ fontSize: 13, color: cor.cinza }}>Subtotal</T>
                  <T style={{ fontSize: 13 }}>{centavosParaReais(subtotalCentavos(orcamento))}</T>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <T style={{ fontSize: 13, color: cor.cinza }}>Desconto</T>
                  <T style={{ fontSize: 13 }}>-{centavosParaReais(orcamento.descontoCentavos)}</T>
                </View>
              </>
            )}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
              <T style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>Total</T>
              <T style={{ fontFamily: "Baloo", fontSize: 30, color: cor.laranja }}>{centavosParaReais(totalCentavos(orcamento))}</T>
            </View>
          </View>
        </View>
      </View>
    </Folha>
  );
}

function Galeria({ p, fotos }: { p: PaginaDoTipo<"galeria">; fotos: (Foto | null)[] }) {
  const caixas = caixasGaleria(fotos.length, p.texto);
  return (
    <Folha>
      <Titulo>{p.titulo || "Imagens do projeto"}</Titulo>
      {linhasGaleria(p.texto) > 0 && (
        <T style={{ position: "absolute", left: M, top: 92, width: LARGURA_UTIL, fontSize: 15, lineHeight: 1.4 }}>{p.texto.trim()}</T>
      )}
      {fotos.map((foto, i) => (
        <Fotografia key={i} foto={foto} caixa={caixas[i]} fundo={p.inteira ? cor.branco : undefined} />
      ))}
    </Folha>
  );
}

function Informacoes({ p, fotos }: { p: PaginaDoTipo<"informacoes">; fotos: (Foto | null)[] }) {
  const foto = fotos[0] ?? null;
  const largura = foto ? 408 : LARGURA_UTIL;
  const fonte = tamanho(p.texto, foto ? [[350, 16], [650, 13.5], [900, 12]] : [[600, 16], [1100, 13.5]], 11);
  return (
    <Folha>
      <Titulo>{p.titulo || "Informações adicionais"}</Titulo>
      {p.texto.trim() && (
        <View style={{ position: "absolute", left: M, top: TOPO, width: largura, height: BASE - TOPO, backgroundColor: cor.branco, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 22 }}>
          <T style={{ fontSize: fonte, lineHeight: 1.5 }}>{p.texto.trim()}</T>
        </View>
      )}
      <Fotografia foto={foto} caixa={p.texto.trim() ? CAIXA_INFO_IMAGEM : { left: M, top: TOPO, width: LARGURA_UTIL, height: BASE - TOPO }} />
    </Folha>
  );
}

function Contato({ p }: { p: PaginaDoTipo<"contato"> }) {
  return (
    <Folha fundo={cor.teal} rodape={false}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- Image aqui é do @react-pdf/renderer (destino é PDF), não HTML img */}
      <Image src={LOGO} style={{ position: "absolute", left: 62, top: 140, width: 390, height: 241 }} />
      <View style={{ position: "absolute", left: 484, top: 140, width: 420 }}>
        <T style={{ fontFamily: "Baloo", fontSize: 44, color: cor.branco, lineHeight: 1.12 }}>{p.titulo}</T>
        {p.telefone && <T style={{ fontWeight: 800, fontSize: 19, marginTop: 22 }}>{p.telefone}</T>}
        {p.email && <T style={{ fontWeight: 700, fontSize: 16, marginTop: 14 }}>{p.email}</T>}
        {p.instagram && <T style={{ fontWeight: 700, fontSize: 16, marginTop: 14 }}>{p.instagram}</T>}
        {p.endereco && <T style={{ fontSize: 14, marginTop: 14, lineHeight: 1.4 }}>{p.endereco}</T>}
      </View>
    </Folha>
  );
}

function PaginaPdf({ pronta, orcamento }: { pronta: PaginaPronta; orcamento: OrcamentoParaApresentacao }) {
  const { pagina: p, fotos } = pronta;
  switch (p.tipo) {
    case "capa":
      return <Capa p={p} />;
    case "sobre":
      return <Sobre p={p} />;
    case "portfolio":
    case "clientes":
    case "ecossistema":
      return <PaginaFixa tipo={p.tipo} />;
    case "como-funciona":
      return <ComoFunciona p={p} />;
    case "projeto":
      return <Projeto p={p} fotos={fotos} />;
    case "modelo":
      return <Modelo p={p} fotos={fotos} />;
    case "investimento":
      return <Investimento p={p} orcamento={orcamento} />;
    case "galeria":
      return <Galeria p={p} fotos={fotos} />;
    case "informacoes":
      return <Informacoes p={p} fotos={fotos} />;
    case "contato":
      return <Contato p={p} />;
  }
}

export async function renderizarApresentacao(paginas: PaginaPronta[], orcamento: OrcamentoParaApresentacao): Promise<Buffer> {
  return renderToBuffer(
    <Document title={`Apresentação Legaus Kids — Orçamento ${String(orcamento.numero).padStart(4, "0")}`} author="Legaus Kids">
      {paginas.map((pronta) => (
        <PaginaPdf key={pronta.pagina.id} pronta={pronta} orcamento={orcamento} />
      ))}
    </Document>,
  );
}
