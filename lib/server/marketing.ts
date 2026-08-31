import "server-only";
import path from "node:path";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import Anthropic from "@anthropic-ai/sdk";
import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import type { TipoPostagem, StatusPostagem, LayoutVariante } from "@prisma/client";

const LOGO_PATH = path.join(process.cwd(), "public", "legaus-logo.png");
const FONTE_HEADLINE_PATH = path.join(process.cwd(), "assets", "fonts", "Baloo2-ExtraBold.ttf");
const COR_MARCA = "#00A99D";
const COR_MARCA_ESCURA = "#00786f";
const COR_CONTORNO_TEXTO = "#ff6b3d";
const MODELO_IA = "claude-sonnet-5";

const DIMENSOES: Record<TipoPostagem, { largura: number; altura: number }> = {
  FEED_INSTAGRAM: { largura: 1080, altura: 1350 },
  FEED_FACEBOOK: { largura: 1080, altura: 1350 },
  STORY_INSTAGRAM: { largura: 1080, altura: 1920 },
  STATUS_WHATSAPP: { largura: 1080, altura: 1920 },
};

/**
 * Composição de marca — deliberadamente NÃO usa IA generativa pra "redesenhar"
 * a foto (arriscado demais distorcer uma instalação/produto real). É um
 * enquadramento + elementos de marca determinísticos, em 3 variantes de
 * layout (faixa embaixo, logo no canto sem faixa, faixa lateral vertical),
 * pra escolher qual encaixa melhor em cada foto — nem toda foto tem espaço
 * pra faixa.
 */
async function gerarFaixa(base: Buffer, largura: number, altura: number): Promise<Buffer> {
  const larguraLogo = Math.round(largura * 0.32);
  const paddingVertical = Math.round(largura * 0.03);

  const logoBuffer = await sharp(LOGO_PATH).resize({ width: larguraLogo }).png().toBuffer();
  const logoMeta = await sharp(logoBuffer).metadata();
  const logoAltura = logoMeta.height ?? 0;
  // altura da faixa segue o tamanho real do logo (com sua legenda "Fábrica de
  // Brinquedos") em vez de uma fração fixa da imagem — evita cortar o logo.
  const alturaFaixa = logoAltura + paddingVertical * 2;
  const alturaTransicao = Math.round(alturaFaixa * 0.55);

  const transicaoSvg = `<svg width="${largura}" height="${alturaTransicao}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${COR_MARCA_ESCURA}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${COR_MARCA_ESCURA}" stop-opacity="0.92"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
  </svg>`;
  const faixaSvg = `<svg width="${largura}" height="${alturaFaixa}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g2" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${COR_MARCA_ESCURA}"/>
      <stop offset="100%" stop-color="${COR_MARCA}"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g2)"/>
  </svg>`;

  return sharp(base)
    .composite([
      { input: Buffer.from(transicaoSvg), top: altura - alturaFaixa - alturaTransicao, left: 0 },
      { input: Buffer.from(faixaSvg), top: altura - alturaFaixa, left: 0 },
      { input: logoBuffer, top: altura - alturaFaixa + paddingVertical, left: Math.round((largura - larguraLogo) / 2) },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}

async function gerarCanto(base: Buffer, largura: number, altura: number): Promise<Buffer> {
  const larguraLogo = Math.round(largura * 0.3);
  const logoBuffer = await sharp(LOGO_PATH).resize({ width: larguraLogo }).png().toBuffer();
  const logoMeta = await sharp(logoBuffer).metadata();
  const logoAltura = logoMeta.height ?? 0;

  const margem = Math.round(largura * 0.05);
  const padding = Math.round(largura * 0.025);
  const cardLargura = larguraLogo + padding * 2;
  const cardAltura = logoAltura + padding * 2;
  const folga = 30;
  const left = largura - margem - cardLargura;
  const top = altura - margem - cardAltura;

  const cardSvg = `<svg width="${cardLargura + folga * 2}" height="${cardAltura + folga * 2}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="s" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000000" flood-opacity="0.32"/>
      </filter>
    </defs>
    <rect x="${folga}" y="${folga}" width="${cardLargura}" height="${cardAltura}" rx="20" ry="20" fill="white" fill-opacity="0.94" filter="url(#s)"/>
  </svg>`;

  return sharp(base)
    .composite([
      { input: Buffer.from(cardSvg), top: top - folga, left: left - folga },
      { input: logoBuffer, top: top + padding, left: left + padding },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}

async function gerarLateral(base: Buffer, largura: number, altura: number): Promise<Buffer> {
  const larguraFaixa = Math.round(largura * 0.17);
  const padding = Math.round(larguraFaixa * 0.16);

  const logoRotacionado = await sharp(LOGO_PATH)
    .rotate(90)
    .resize({ width: larguraFaixa - padding * 2 })
    .png()
    .toBuffer();
  const logoMeta = await sharp(logoRotacionado).metadata();
  const logoLargura = logoMeta.width ?? 0;
  const logoAltura = logoMeta.height ?? 0;

  const left = largura - larguraFaixa;
  const larguraTransicao = Math.round(larguraFaixa * 0.6);

  const transicaoSvg = `<svg width="${larguraTransicao}" height="${altura}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g3" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${COR_MARCA_ESCURA}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${COR_MARCA_ESCURA}" stop-opacity="0.92"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g3)"/>
  </svg>`;
  const faixaSvg = `<svg width="${larguraFaixa}" height="${altura}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g4" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${COR_MARCA}"/>
      <stop offset="100%" stop-color="${COR_MARCA_ESCURA}"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g4)"/>
  </svg>`;

  return sharp(base)
    .composite([
      { input: Buffer.from(transicaoSvg), top: 0, left: left - larguraTransicao },
      { input: Buffer.from(faixaSvg), top: 0, left },
      {
        input: logoRotacionado,
        top: Math.round((altura - logoAltura) / 2),
        left: left + Math.round((larguraFaixa - logoLargura) / 2),
      },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}

function sparkleSvg(tamanho: number, cor: string): string {
  return `<svg width="${tamanho}" height="${tamanho}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M50 0 L61 39 L100 50 L61 61 L50 100 L39 61 L0 50 L39 39 Z" fill="${cor}"/></svg>`;
}

/**
 * Renderiza o texto de destaque flutuando direto sobre a foto — texto branco
 * grande em Baloo 2 com contorno colorido (WebkitTextStroke) e sombra, igual
 * ao estilo das postagens reais do Instagram da Legaus Kids, em vez de uma
 * pílula com fundo sólido (que tampava a foto e ficava artificial). Usa
 * next/og (satori) porque é o único caminho testado que embute fonte
 * customizada de forma confiável tanto localmente quanto na Vercel — e,
 * important: satori tem suporte real a WebkitTextStroke/textShadow, então dá
 * pra imitar a tipografia "bubble" sem precisar de Chromium nem de serviço
 * externo.
 */
async function renderizarHeadline(texto: string, largura: number, altura: number): Promise<Buffer> {
  const fonte = await readFile(FONTE_HEADLINE_PATH);
  const numeroPalavras = texto.trim().split(/\s+/).length;
  const fontSize = numeroPalavras > 5 ? 60 : numeroPalavras > 3 ? 72 : 86;

  const resposta = new ImageResponse(
    {
      type: "div",
      key: null,
      props: {
        style: {
          width: largura,
          height: altura,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-start",
          padding: "72px 64px",
        },
        children: {
          type: "div",
          key: null,
          props: {
            style: {
              display: "flex",
              flexWrap: "wrap",
              width: Math.round(largura * 0.78),
              fontFamily: "Baloo2",
              fontWeight: 800,
              fontSize,
              color: "white",
              WebkitTextStroke: `9px ${COR_CONTORNO_TEXTO}`,
              lineHeight: 1.08,
              textShadow: "0 8px 18px rgba(0,0,0,0.45)",
            },
            children: texto,
          },
        },
      },
    } as ConstructorParameters<typeof ImageResponse>[0],
    { width: largura, height: altura, fonts: [{ name: "Baloo2", data: fonte, weight: 800, style: "normal" }] },
  );

  return Buffer.from(await resposta.arrayBuffer());
}

async function montarCamadaHeadline(
  texto: string,
  largura: number,
  altura: number,
): Promise<sharp.OverlayOptions[]> {
  const headlineBuffer = await renderizarHeadline(texto, largura, altura);
  return [
    { input: headlineBuffer, top: 0, left: 0 },
    {
      input: Buffer.from(sparkleSvg(Math.round(largura * 0.052), "#ffd23f")),
      top: Math.round(altura * 0.03),
      left: largura - Math.round(largura * 0.12),
    },
    {
      input: Buffer.from(sparkleSvg(Math.round(largura * 0.028), "#ffffff")),
      top: Math.round(altura * 0.08),
      left: largura - Math.round(largura * 0.065),
    },
  ];
}

export type VarianteGerada = { layout: LayoutVariante; buffer: Buffer };

export async function compositarVariantes(
  bufferOriginal: Buffer,
  tipo: TipoPostagem,
  headline?: string | null,
): Promise<VarianteGerada[]> {
  const { largura, altura } = DIMENSOES[tipo];

  const base = await sharp(bufferOriginal)
    .rotate()
    .resize(largura, altura, { fit: "cover", position: "attention" })
    .toBuffer();

  const camadaHeadline = headline?.trim() ? await montarCamadaHeadline(headline.trim(), largura, altura) : null;

  const comHeadline = async (buf: Buffer): Promise<Buffer> => {
    if (!camadaHeadline) return buf;
    return sharp(buf).composite(camadaHeadline).jpeg({ quality: 92 }).toBuffer();
  };

  const [faixa, canto, lateral] = await Promise.all([
    gerarFaixa(base, largura, altura),
    gerarCanto(base, largura, altura),
    gerarLateral(base, largura, altura),
  ]);

  return [
    { layout: "FAIXA", buffer: await comHeadline(faixa) },
    { layout: "CANTO", buffer: await comHeadline(canto) },
    { layout: "LATERAL", buffer: await comHeadline(lateral) },
  ];
}

/**
 * Edição por IA generativa (OpenAI gpt-image-1) — separada de propósito da
 * composição de marca acima. Só roda quando solicitado explicitamente
 * (melhorar qualidade, remover objeto, trocar fundo etc.), porque alterar a
 * foto de um produto/instalação real tem risco real de distorcer o que foi
 * de fato entregue. V1 é só por instrução em texto, sem máscara/seleção de
 * área.
 */
export async function editarImagemComIA(buffer: Buffer, mimetype: string, instrucao: string): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada — edição por IA indisponível.");

  const extensao = mimetype === "image/png" ? "png" : "jpg";
  const form = new FormData();
  form.append("model", "gpt-image-1");
  form.append("prompt", instrucao);
  form.append("image", new Blob([new Uint8Array(buffer)], { type: mimetype }), `imagem.${extensao}`);

  const resposta = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    throw new Error(`Falha na edição por IA (${resposta.status}): ${detalhe.slice(0, 300)}`);
  }

  const json = (await resposta.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("Edição por IA não retornou imagem.");
  return Buffer.from(b64, "base64");
}

// Voz capturada do Instagram real (@legaus.kids) em 2026-08-31: entusiasmada,
// comunitária, foco em desenvolvimento infantil e inclusão (linha PNE),
// menções à cidade, emoji temático com moderação, nada corporativo/frio.
const VOZ_DA_MARCA = `Você é a redatora de mídias sociais da Legaus Kids, fábrica de playgrounds e parques infantis de Santa Rosa/RS (site legauskids.com.br). O tom de voz da marca, observado no Instagram real da empresa:
- Entusiasmada e comunitária, nunca corporativa ou fria.
- Foco no desenvolvimento infantil, no brincar e na inclusão (a Legaus Kids tem uma linha PNE, pra pessoas com necessidades especiais — mencione quando fizer sentido).
- Menciona a cidade/região quando cabe, com carinho local.
- Emoji temático com moderação (criança, brinquedo, símbolos de inclusão) — nunca emoji genérico de empresa (💼📈✅).
- Frases curtas, calorosas.
Escreva só o texto da legenda pronta pra usar — sem explicações, sem aspas envolvendo tudo.`;

export async function gerarLegenda(input: { tipo: TipoPostagem; contexto: string }): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "";

  const ehFormatoCurto = input.tipo === "STORY_INSTAGRAM" || input.tipo === "STATUS_WHATSAPP";
  const instrucaoFormato = ehFormatoCurto
    ? "Formato: story/status — 1 a 2 frases curtas, pensadas pra aparecer sobre a foto. Sem hashtag."
    : "Formato: post de feed — 2 a 4 frases + 3 a 6 hashtags relevantes ao final (inclua #LegausKids e a cidade se souber).";

  try {
    const client = new Anthropic({ apiKey });
    const resposta = await client.messages.create({
      model: MODELO_IA,
      max_tokens: 400,
      system: VOZ_DA_MARCA,
      messages: [
        {
          role: "user",
          content: `Contexto da foto, descrito por quem enviou: "${input.contexto || "(sem descrição — use algo genérico de acordo com o tipo de postagem)"}"\n\n${instrucaoFormato}`,
        },
      ],
    });
    return resposta.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  } catch {
    return "";
  }
}

export async function criarPostagem(input: {
  tipo: TipoPostagem;
  contexto: string;
  headline?: string;
  imagens: { buffer: Buffer; mime: string }[];
  criadoPorId: string;
}) {
  const legenda = await gerarLegenda({ tipo: input.tipo, contexto: input.contexto });

  const imagensParaCriar = await Promise.all(
    input.imagens.map(async (img, ordem) => {
      const variantes = await compositarVariantes(img.buffer, input.tipo, input.headline);
      return {
        ordem,
        imagemOriginal: new Uint8Array(img.buffer),
        imagemOriginalMime: img.mime,
        variantes: {
          create: variantes.map((v, i) => ({
            layout: v.layout,
            escolhida: i === 0,
            imagem: new Uint8Array(v.buffer),
            imagemMime: "image/jpeg",
          })),
        },
      };
    }),
  );

  return prisma.postagem.create({
    data: {
      tipo: input.tipo,
      contexto: input.contexto || null,
      headline: input.headline || null,
      legenda,
      criadoPorId: input.criadoPorId,
      imagens: { create: imagensParaCriar },
    },
    include: { imagens: { include: { variantes: true } } },
  });
}

export function listarPostagens(status?: StatusPostagem, ids?: string[]) {
  return prisma.postagem.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
    },
    select: {
      id: true,
      numero: true,
      tipo: true,
      status: true,
      legenda: true,
      contexto: true,
      headline: true,
      criadoEm: true,
      criadoPor: { select: { nome: true } },
      imagens: {
        orderBy: { ordem: "asc" },
        select: {
          id: true,
          ordem: true,
          variantes: { select: { id: true, layout: true, escolhida: true } },
        },
      },
    },
    orderBy: { criadoEm: "desc" },
  });
}

export function buscarPostagemPorId(id: string) {
  return prisma.postagem.findUnique({
    where: { id },
    include: {
      criadoPor: { select: { nome: true } },
      imagens: {
        orderBy: { ordem: "asc" },
        include: { variantes: true },
      },
    },
  });
}

export function buscarVariantePorId(id: string) {
  return prisma.postagemImagemVariante.findUnique({ where: { id } });
}

export function buscarImagemOriginalPorId(id: string) {
  return prisma.postagemImagem.findUnique({
    where: { id },
    select: { imagemOriginal: true, imagemOriginalMime: true },
  });
}

export async function definirVarianteEscolhida(postagemImagemId: string, varianteId: string): Promise<void> {
  await prisma.$transaction([
    prisma.postagemImagemVariante.updateMany({
      where: { postagemImagemId },
      data: { escolhida: false },
    }),
    prisma.postagemImagemVariante.update({
      where: { id: varianteId },
      data: { escolhida: true },
    }),
  ]);
}

export async function editarImagemDaPostagem(postagemImagemId: string, instrucao: string): Promise<void> {
  const imagem = await prisma.postagemImagem.findUniqueOrThrow({
    where: { id: postagemImagemId },
    include: { postagem: { select: { tipo: true, headline: true } } },
  });

  const editada = await editarImagemComIA(Buffer.from(imagem.imagemOriginal), imagem.imagemOriginalMime, instrucao);
  const variantes = await compositarVariantes(editada, imagem.postagem.tipo, imagem.postagem.headline);

  await prisma.$transaction([
    prisma.postagemImagem.update({
      where: { id: postagemImagemId },
      data: { imagemOriginal: new Uint8Array(editada), imagemOriginalMime: "image/png" },
    }),
    prisma.postagemImagemVariante.deleteMany({ where: { postagemImagemId } }),
    prisma.postagemImagemVariante.createMany({
      data: variantes.map((v, i) => ({
        postagemImagemId,
        layout: v.layout,
        escolhida: i === 0,
        imagem: new Uint8Array(v.buffer),
        imagemMime: "image/jpeg",
      })),
    }),
  ]);
}

export async function atualizarLegendaPostagem(id: string, legenda: string): Promise<void> {
  await prisma.postagem.update({ where: { id }, data: { legenda } });
}

export async function atualizarStatusPostagem(id: string, status: StatusPostagem): Promise<void> {
  await prisma.postagem.update({ where: { id }, data: { status } });
}

export async function excluirPostagem(id: string): Promise<void> {
  await prisma.postagem.delete({ where: { id } });
}

const MODELOS_PADRAO_INICIAIS: { titulo: string; tipo: TipoPostagem; legendaModelo: string }[] = [
  {
    titulo: "Nova instalação concluída",
    tipo: "FEED_INSTAGRAM",
    legendaModelo:
      "Mais um sonho realizado! 🎡✨ Instalamos {{descricao_projeto}} em {{cidade}}. Nada como ver a alegria da criançada tomando conta do novo espaço! 💚\n\n#LegausKids #{{cidade_hashtag}} #Playground #BrincarÉCoisaSéria",
  },
  {
    titulo: "Produto em destaque",
    tipo: "FEED_INSTAGRAM",
    legendaModelo:
      "Conheça o {{nome_produto}}! 🧒🛝 Feito pra transformar qualquer espaço em diversão garantida, com toda a qualidade e segurança Legaus Kids.\n\nFale com a gente e peça seu orçamento! 📲\n\n#LegausKids #FábricaDeBrinquedos #{{cidade_hashtag}}",
  },
  {
    titulo: "Data comemorativa da cidade",
    tipo: "FEED_INSTAGRAM",
    legendaModelo:
      "Parabéns, {{cidade}}! 🎉 A Legaus Kids se orgulha de fazer parte dessa história, contribuindo com espaços que incentivam o brincar, o convívio e o desenvolvimento das nossas crianças.\n\n#LegausKids #{{cidade_hashtag}}",
  },
  {
    titulo: "Bastidores de produção",
    tipo: "STORY_INSTAGRAM",
    legendaModelo: "Direto da fábrica! 🔨🧸 Mais um {{nome_produto}} sendo preparado com todo cuidado pra chegar até vocês.",
  },
];

export async function garantirModelosPadrao(): Promise<void> {
  const existentes = await prisma.modeloPostagem.count();
  if (existentes > 0) return;
  await prisma.modeloPostagem.createMany({ data: MODELOS_PADRAO_INICIAIS });
}

export async function listarModelos() {
  await garantirModelosPadrao();
  return prisma.modeloPostagem.findMany({ orderBy: { criadoEm: "asc" } });
}

export async function salvarModelo(id: string, legendaModelo: string) {
  return prisma.modeloPostagem.update({ where: { id }, data: { legendaModelo } });
}

export async function criarModelo(input: { titulo: string; tipo: TipoPostagem; legendaModelo: string }) {
  return prisma.modeloPostagem.create({ data: input });
}

export async function excluirModelo(id: string): Promise<void> {
  await prisma.modeloPostagem.delete({ where: { id } });
}
