import "server-only";
import path from "node:path";
import sharp from "sharp";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import type { TipoPostagem, StatusPostagem } from "@prisma/client";

const LOGO_PATH = path.join(process.cwd(), "public", "legaus-logo.png");
const COR_MARCA = "#00A99D";
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
 * enquadramento + faixa de marca determinísticos: sempre correto, sempre
 * previsível, a mesma identidade visual em toda postagem.
 */
export async function compositarImagemBranded(bufferOriginal: Buffer, tipo: TipoPostagem): Promise<Buffer> {
  const { largura, altura } = DIMENSOES[tipo];
  const alturaFaixa = Math.round(altura * 0.12);
  const larguraLogo = Math.round(largura * 0.4);

  const base = await sharp(bufferOriginal)
    .rotate()
    .resize(largura, altura, { fit: "cover", position: "attention" })
    .toBuffer();

  const logoBuffer = await sharp(LOGO_PATH).resize({ width: larguraLogo }).png().toBuffer();
  const logoMeta = await sharp(logoBuffer).metadata();
  const logoAltura = logoMeta.height ?? 0;

  const faixaSvg = `<svg width="${largura}" height="${alturaFaixa}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${COR_MARCA}"/></svg>`;

  return sharp(base)
    .composite([
      { input: Buffer.from(faixaSvg), top: altura - alturaFaixa, left: 0 },
      {
        input: logoBuffer,
        top: altura - alturaFaixa + Math.round((alturaFaixa - logoAltura) / 2),
        left: Math.round((largura - larguraLogo) / 2),
      },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
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
  imagemBuffer: Buffer;
  imagemMime: string;
  criadoPorId: string;
}) {
  const imagemEditada = await compositarImagemBranded(input.imagemBuffer, input.tipo);
  const legenda = await gerarLegenda({ tipo: input.tipo, contexto: input.contexto });

  return prisma.postagem.create({
    data: {
      tipo: input.tipo,
      contexto: input.contexto || null,
      legenda,
      imagemOriginal: new Uint8Array(input.imagemBuffer),
      imagemOriginalMime: input.imagemMime,
      imagemEditada: new Uint8Array(imagemEditada),
      imagemEditadaMime: "image/jpeg",
      criadoPorId: input.criadoPorId,
    },
  });
}

export function listarPostagens(status?: StatusPostagem) {
  return prisma.postagem.findMany({
    where: status ? { status } : undefined,
    select: {
      id: true,
      numero: true,
      tipo: true,
      status: true,
      legenda: true,
      contexto: true,
      criadoEm: true,
      criadoPor: { select: { nome: true } },
    },
    orderBy: { criadoEm: "desc" },
  });
}

export function buscarPostagemPorId(id: string) {
  return prisma.postagem.findUnique({ where: { id } });
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
