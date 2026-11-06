import { z } from "zod";
import { centavosParaReais } from "./money";

// Apresentação do orçamento (pedido de 2026-11-06): um PDF 16:9 no formato
// da "Apresentação Legaus Kids" montado a partir do orçamento. Cada página
// dá pra editar, mudar de lugar e marcar se vai para o cliente; dá também pra
// acrescentar fotos de obras, imagens extras e informações adicionais.
// Campo de texto vazio = automático (vem do orçamento) quando a página tem
// um valor automático (ver textosAutomaticos).

export const TIPOS_PAGINA = [
  "capa",
  "sobre",
  "portfolio",
  "clientes",
  "ecossistema",
  "como-funciona",
  "projeto",
  "modelo",
  "investimento",
  "galeria",
  "informacoes",
  "contato",
] as const;
export type TipoPagina = (typeof TIPOS_PAGINA)[number];

/** Páginas que ficam como no modelo (imagem da apresentação original). */
export const PAGINAS_FIXAS = ["portfolio", "clientes", "ecossistema"] as const satisfies readonly TipoPagina[];

/** Páginas que dá pra acrescentar (e excluir) quantas vezes quiser. */
export const PAGINAS_AVULSAS = ["projeto", "modelo", "galeria", "informacoes"] as const satisfies readonly TipoPagina[];

export const NOME_PAGINA: Record<TipoPagina, string> = {
  capa: "Capa",
  sobre: "Quem somos",
  portfolio: "Portfólio",
  clientes: "Quem já confia na Legaus",
  ecossistema: "Ecossistema de produção",
  "como-funciona": "Como funciona",
  projeto: "Projeto realizado",
  modelo: "O modelo para o seu espaço",
  investimento: "Investimento",
  galeria: "Imagens extras",
  informacoes: "Informações adicionais",
  contato: "Contato",
};

/** Quantas imagens cada página aceita. */
export const MAX_IMAGENS: Partial<Record<TipoPagina, number>> = { projeto: 3, modelo: 1, galeria: 4, informacoes: 1 };

export const MAX_IMAGENS_ORCAMENTO = 30;

const texto = (max: number) =>
  z
    .string()
    .catch("")
    .transform((s) => s.slice(0, max));
const imagens = (max: number) =>
  z
    .array(z.string().min(1).max(40))
    .catch([])
    .transform((ids) => [...new Set(ids)].slice(0, max));
const base = { id: z.string().min(1).max(40), incluir: z.boolean().catch(true) };

const paginaSchema = z.discriminatedUnion("tipo", [
  z.object({ ...base, tipo: z.literal("capa"), titulo: texto(120), subtitulo: texto(200), proposta: texto(160) }),
  z.object({
    ...base,
    tipo: z.literal("sobre"),
    quemSomos: texto(500),
    oQueFazemos: texto(500),
    numeros: z
      .array(z.object({ valor: texto(12), rotulo: texto(40) }))
      .catch([])
      .transform((n) => n.slice(0, 3)),
  }),
  z.object({ ...base, tipo: z.enum(PAGINAS_FIXAS) }),
  z.object({
    ...base,
    tipo: z.literal("como-funciona"),
    titulo: texto(80),
    etapas: z
      .array(z.object({ titulo: texto(40), texto: texto(200) }))
      .catch([])
      .transform((e) => e.slice(0, 6)),
  }),
  z.object({
    ...base,
    tipo: z.literal("projeto"),
    cliente: texto(80),
    local: texto(80),
    entregamos: texto(300),
    ambiente: texto(160),
    depoimento: texto(400),
    imagens: imagens(3),
  }),
  z.object({
    ...base,
    tipo: z.literal("modelo"),
    titulo: texto(80),
    /** Posição do item no orçamento (-1 = nenhum). */
    item: z.number().int().min(-1).max(500).catch(-1),
    modelo: texto(120),
    dimensoes: texto(100),
    itens: texto(600),
    prazo: texto(80),
    investimento: texto(60),
    mostrarInvestimento: z.boolean().catch(true),
    imagens: imagens(1),
  }),
  z.object({ ...base, tipo: z.literal("investimento"), titulo: texto(80), texto: texto(600) }),
  z.object({ ...base, tipo: z.literal("galeria"), titulo: texto(80), texto: texto(300), inteira: z.boolean().catch(false), imagens: imagens(4) }),
  z.object({ ...base, tipo: z.literal("informacoes"), titulo: texto(80), texto: texto(1500), imagens: imagens(1) }),
  z.object({ ...base, tipo: z.literal("contato"), titulo: texto(80), telefone: texto(40), email: texto(80), instagram: texto(60), endereco: texto(160) }),
]);

export type PaginaApresentacao = z.infer<typeof paginaSchema>;
export type PaginaDoTipo<T extends TipoPagina> = Extract<PaginaApresentacao, { tipo: T }>;

/** O que a apresentação precisa saber do orçamento (serializável — vai pro editor também). */
export type OrcamentoParaApresentacao = {
  numero: number;
  cliente: string | null;
  /** "dd/mm/aaaa" */
  validoAte: string;
  descontoCentavos: number;
  observacoes: string | null;
  itens: { nome: string; descricao: string | null; quantidade: number; valorUnitarioCentavos: number; fotoUrl: string | null }[];
};

/** Imagem enviada pra apresentação (sem os bytes). */
export type ImagemApresentacaoVM = { id: string; nome: string | null; largura: number; altura: number };

export const numeroOrcamento =(numero: number) => String(numero).padStart(4, "0");

export function nomeArquivoApresentacao(numero: number): string {
  return `apresentacao-${numeroOrcamento(numero)}.pdf`;
}

export function textoEnvioApresentacaoWhatsApp(numero: number): string {
  return `Olá! Segue em anexo a apresentação da proposta *#${numeroOrcamento(numero)}* da Legaus Kids.\n\nQualquer dúvida, estamos à disposição!`;
}

export function subtotalCentavos(orcamento: OrcamentoParaApresentacao): number {
  return orcamento.itens.reduce((soma, i) => soma + i.quantidade * i.valorUnitarioCentavos, 0);
}

export function totalCentavos(orcamento: OrcamentoParaApresentacao): number {
  return Math.max(0, subtotalCentavos(orcamento) - orcamento.descontoCentavos);
}

function compactar(textoLivre: string, max: number): string {
  const limpo = textoLivre.replace(/\r/g, "").replace(/\n{2,}/g, "\n").trim();
  return limpo.length > max ? `${limpo.slice(0, max - 1).trimEnd()}…` : limpo;
}

/**
 * Valores que entram quando o campo da página fica vazio — o editor mostra
 * como dica (placeholder) e o PDF usa. Só existem para capa e modelo.
 */
export function textosAutomaticos(pagina: PaginaApresentacao, orcamento: OrcamentoParaApresentacao): Record<string, string> {
  if (pagina.tipo === "capa") {
    const numero = `Orçamento nº ${numeroOrcamento(orcamento.numero)}`;
    return { proposta: orcamento.cliente ? `Proposta para ${orcamento.cliente} · ${numero}` : numero };
  }
  if (pagina.tipo === "modelo") {
    const item = orcamento.itens[pagina.item];
    if (!item) return { investimento: centavosParaReais(totalCentavos(orcamento)) };
    const valor = orcamento.itens.length === 1 ? totalCentavos(orcamento) : item.quantidade * item.valorUnitarioCentavos;
    return {
      modelo: item.quantidade > 1 ? `${item.nome} (${item.quantidade} unidades)` : item.nome,
      itens: item.descricao ? compactar(item.descricao, 600) : "",
      investimento: centavosParaReais(valor),
    };
  }
  return {};
}

/** Página com os campos vazios já preenchidos pelo automático (o que vai pro PDF). */
export function resolverPagina<P extends PaginaApresentacao>(pagina: P, orcamento: OrcamentoParaApresentacao): P {
  const automaticos = textosAutomaticos(pagina, orcamento);
  const resolvida = { ...pagina } as Record<string, unknown>;
  for (const [campo, valor] of Object.entries(automaticos)) {
    if (typeof resolvida[campo] === "string" && !(resolvida[campo] as string).trim()) resolvida[campo] = valor;
  }
  return resolvida as P;
}

export const ETAPAS_PADRAO = [
  { titulo: "Proposta", texto: "Entendemos seu espaço e indicamos o projeto." },
  { titulo: "Contrato", texto: "Formalizamos itens, valores e prazos." },
  { titulo: "Produção", texto: "Nossos parceiros produzem os brinquedos do seu projeto." },
  { titulo: "Instalação", texto: "Agendamos a data e entregamos instalado." },
  { titulo: "Avaliação", texto: "Acompanhamos e ouvimos sua avaliação." },
];

/** Página nova, com os textos do modelo. `item` só vale pra página de modelo. */
export function novaPagina(tipo: TipoPagina, id: string, item = -1): PaginaApresentacao {
  switch (tipo) {
    case "capa":
      return { id, incluir: true, tipo, titulo: "Brincadeira levada a sério.", subtitulo: "Há mais de 10 anos transformando sonhos em realidade", proposta: "" };
    case "sobre":
      return {
        id,
        incluir: true,
        tipo,
        quemSomos: "Somos especialistas em espaços kids sob medida: playgrounds, kidplays e brinquedos para áreas externas e internas.",
        oQueFazemos: "Transformamos sonhos em realidade, lugares ociosos em espaços de convivência e conexão, e espaços comuns em ambientes lucrativos.",
        numeros: [
          { valor: "+10", rotulo: "Anos de mercado" },
          { valor: "", rotulo: "Obras entregues" },
          { valor: "", rotulo: "Cidades atendidas" },
        ],
      };
    case "portfolio":
    case "clientes":
    case "ecossistema":
      return { id, incluir: true, tipo };
    case "como-funciona":
      return { id, incluir: true, tipo, titulo: "Como funciona", etapas: ETAPAS_PADRAO.map((e) => ({ ...e })) };
    case "projeto":
      return { id, incluir: true, tipo, cliente: "", local: "", entregamos: "", ambiente: "", depoimento: "", imagens: [] };
    case "modelo":
      return { id, incluir: true, tipo, titulo: "O modelo para o seu espaço", item, modelo: "", dimensoes: "", itens: "", prazo: "", investimento: "", mostrarInvestimento: true, imagens: [] };
    case "investimento":
      return { id, incluir: true, tipo, titulo: "Investimento", texto: "" };
    case "galeria":
      return { id, incluir: true, tipo, titulo: "Imagens do projeto", texto: "", inteira: false, imagens: [] };
    case "informacoes":
      return { id, incluir: true, tipo, titulo: "Informações adicionais", texto: "", imagens: [] };
    case "contato":
      return {
        id,
        incluir: true,
        tipo,
        titulo: "Vamos criar o seu espaço?",
        telefone: "(55) 99960-3257",
        email: "contato@legauskids.com.br",
        instagram: "@legaus.kids",
        endereco: "Av. Tuparendi, 659, Sala 01, Centro\nSanta Rosa/RS",
      };
  }
}

const MAX_PAGINAS_MODELO_PADRAO = 6;

/**
 * Apresentação montada do zero a partir do orçamento: as páginas do modelo,
 * uma página "O modelo para o seu espaço" por item com foto (até 6; se nenhum
 * tiver foto, a do primeiro item) e o resumo do investimento quando há mais de
 * um item. "Projeto realizado" já vem na lista, mas fora até ganhar fotos.
 */
export function apresentacaoPadrao(orcamento: OrcamentoParaApresentacao): PaginaApresentacao[] {
  const comFoto = orcamento.itens.flatMap((item, i) => (item.fotoUrl ? [i] : [])).slice(0, MAX_PAGINAS_MODELO_PADRAO);
  const itensModelo = comFoto.length > 0 ? comFoto : orcamento.itens.length > 0 ? [0] : [];
  const variosValores = orcamento.itens.length > 1 || orcamento.descontoCentavos > 0;

  return [
    novaPagina("capa", "capa"),
    novaPagina("sobre", "sobre"),
    novaPagina("portfolio", "portfolio"),
    novaPagina("clientes", "clientes"),
    novaPagina("ecossistema", "ecossistema"),
    novaPagina("como-funciona", "como-funciona"),
    { ...novaPagina("projeto", "projeto"), incluir: false },
    ...(itensModelo.length > 0 ? itensModelo.map((i) => novaPagina("modelo", `modelo-${i}`, i)) : [novaPagina("modelo", "modelo")]),
    { ...novaPagina("investimento", "investimento"), incluir: variosValores },
    novaPagina("contato", "contato"),
  ];
}

/** Lê as páginas guardadas (JSON do banco ou vindas do editor); null se não der pra aproveitar nada. */
export function normalizarPaginas(bruto: unknown): PaginaApresentacao[] | null {
  if (!Array.isArray(bruto)) return null;
  const vistos = new Set<string>();
  const paginas: PaginaApresentacao[] = [];
  for (const item of bruto.slice(0, 60)) {
    const lida = paginaSchema.safeParse(item);
    if (!lida.success || vistos.has(lida.data.id)) continue;
    vistos.add(lida.data.id);
    paginas.push(lida.data);
  }
  return paginas.length > 0 ? paginas : null;
}

export function imagensUsadas(paginas: PaginaApresentacao[]): string[] {
  return [...new Set(paginas.flatMap((p) => ("imagens" in p ? p.imagens : [])))];
}

/** Tira uma imagem (excluída) de todas as páginas. */
export function semImagem(paginas: PaginaApresentacao[], imagemId: string): PaginaApresentacao[] {
  return paginas.map((p) => ("imagens" in p && p.imagens.includes(imagemId) ? { ...p, imagens: p.imagens.filter((id) => id !== imagemId) } : p));
}

/**
 * Página que, do jeito que está, ficaria vazia no PDF — o editor avisa e o
 * PDF pula (ex.: "Projeto realizado" sem foto nem texto).
 */
export function paginaVazia(pagina: PaginaApresentacao): boolean {
  switch (pagina.tipo) {
    case "projeto":
      return pagina.imagens.length === 0 && !pagina.cliente.trim() && !pagina.entregamos.trim();
    case "galeria":
      return pagina.imagens.length === 0;
    case "informacoes":
      return !pagina.texto.trim() && pagina.imagens.length === 0;
    case "como-funciona":
      return !pagina.etapas.some((e) => e.titulo.trim());
    default:
      return false;
  }
}

/** Páginas que vão para o cliente, na ordem. */
export function paginasDoCliente(paginas: PaginaApresentacao[]): PaginaApresentacao[] {
  return paginas.filter((p) => p.incluir && !paginaVazia(p));
}
