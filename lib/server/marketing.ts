import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import type { ConteudoPostagem, Prisma, StatusPostagem } from "@prisma/client";
import { prisma } from "@/lib/db";
import { renderizarArte, tratarFoto } from "@/lib/server/postagem-render";
import {
  montarArtes,
  sanitizarDadosArte,
  selosComLocal,
  slidesDasFotos,
  textosPadrao,
  type DadosArte,
  type FotosPorSlide,
  type TextosPostagem,
} from "@/lib/utils/postagem-arte";

// Posts do Instagram (padrão da marca de 2026-10-16, reconstruído em
// 2026-10-17 sobre o módulo Marketing antigo, que nunca foi usado). Fluxo:
// cria o post → recebe as fotos uma a uma (já reduzidas no celular) e trata
// cada uma → monta as artes (só os dados; o JPEG é desenhado na primeira vez
// que alguém abre a arte) → a IA sugere a legenda → o Marcos aprova.
// Publicação pela API da Meta é a etapa 3.

const MODELO_IA = "claude-sonnet-5";

/** Story não tem legenda no Instagram: esses tipos saem só em story. */
export const SO_STORY: ConteudoPostagem[] = ["INSTALACAO", "TBT"];

export type DadosNovaPostagem = {
  conteudo: ConteudoPostagem;
  produto?: string | null;
  cliente?: string | null;
  cidade?: string | null;
  negocioId?: string | null;
  preco?: string | null;
  argumentos?: string[];
  contexto?: string | null;
  /** Selo de localização ("Bob's Vacaria") — entra no lugar do segundo selo. */
  local?: string | null;
  /** Linha pequena do título, se não for a padrão do tipo ("Entrega de"). */
  tituloLinha1?: string | null;
  /** Selos no lugar dos padrão do tipo. */
  selos?: string[] | null;
  /** Entrega: fotos por slide do carrossel (padrão 2). */
  fotosPorSlide?: FotosPorSlide | null;
  criadoPorId: string;
};

function limpo(texto: string | null | undefined): string | null {
  const t = texto?.trim();
  return t ? t : null;
}

export async function criarPostagem(d: DadosNovaPostagem) {
  const produto = limpo(d.produto);
  const padrao = textosPadrao(d.conteudo, produto ?? "", d.preco);
  const selos = (d.selos ?? []).map((x) => x.trim()).filter(Boolean);
  const textos: TextosPostagem = {
    titulo: [limpo(d.tituloLinha1) ?? padrao.titulo[0], padrao.titulo[1]],
    selos: selos.length ? selos.slice(0, 2) : padrao.selos,
    preco: limpo(d.preco),
    argumentos: (d.argumentos ?? []).map((a) => a.trim()).filter(Boolean),
    local: limpo(d.local),
    ...(d.fotosPorSlide === 1 && { fotosPorSlide: 1 as const }),
  };
  return prisma.postagem.create({
    data: {
      conteudo: d.conteudo,
      tipo: SO_STORY.includes(d.conteudo) ? "STORY_INSTAGRAM" : "FEED_INSTAGRAM",
      status: "RASCUNHO",
      produto,
      cliente: limpo(d.cliente),
      cidade: limpo(d.cidade),
      negocioId: d.negocioId || null,
      contexto: limpo(d.contexto),
      headline: textos.titulo.filter(Boolean).join(" "),
      textos: textos as unknown as Prisma.InputJsonValue,
      criadoPorId: d.criadoPorId,
    },
    select: { id: true, numero: true },
  });
}

/** Uma foto por vez (o limite de envio da Vercel é ~4,5 MB por chamada). */
/** ordemFixa: quem manda várias fotos ao mesmo tempo diz a posição de cada uma (contar daria corrida). */
export async function adicionarFoto(postagemId: string, original: Buffer, mime: string, ordemFixa?: number) {
  const tratada = await tratarFoto(original);
  const ordem = ordemFixa ?? (await prisma.postagemImagem.count({ where: { postagemId } }));
  return prisma.postagemImagem.create({
    data: {
      postagemId,
      ordem,
      imagemOriginal: new Uint8Array(original),
      imagemOriginalMime: mime || "image/jpeg",
      imagemTratada: new Uint8Array(tratada.buffer),
      largura: tratada.largura,
      altura: tratada.altura,
    },
    select: { id: true },
  });
}

function textosDa(p: { textos: Prisma.JsonValue; conteudo: ConteudoPostagem; produto: string | null }): TextosPostagem {
  const t = p.textos as Partial<TextosPostagem> | null;
  const padrao = textosPadrao(p.conteudo, p.produto ?? "");
  return {
    titulo: Array.isArray(t?.titulo) && t.titulo.length === 2 ? [String(t.titulo[0] ?? ""), String(t.titulo[1] ?? "")] : padrao.titulo,
    selos: Array.isArray(t?.selos) ? t.selos.map(String) : padrao.selos,
    preco: t?.preco ?? null,
    argumentos: Array.isArray(t?.argumentos) ? t.argumentos.map(String) : [],
    local: typeof t?.local === "string" && t.local.trim() ? t.local.trim() : null,
    fotosPorSlide: t?.fotosPorSlide === 1 ? 1 : 2,
  };
}

export function textosDaPostagem(p: { textos: Prisma.JsonValue; conteudo: ConteudoPostagem; produto: string | null }): TextosPostagem {
  return textosDa(p);
}

/**
 * (Re)monta as artes a partir das fotos e dos textos — volta as posições
 * pro padrão. O JPEG de cada arte é desenhado depois (imagemDaArte).
 */
export async function montarArtesDaPostagem(postagemId: string) {
  const p = await prisma.postagem.findUniqueOrThrow({
    where: { id: postagemId },
    select: { conteudo: true, produto: true, textos: true, status: true, imagens: { orderBy: { ordem: "asc" }, select: { id: true, largura: true, altura: true } } },
  });
  if (p.imagens.length === 0) throw new Error("Mande pelo menos uma foto.");
  const textos = textosDa(p);
  const artes = montarArtes({
    conteudo: p.conteudo,
    fotos: p.imagens.map((i) => ({ id: i.id, largura: i.largura ?? 1, altura: i.altura ?? 1 })),
    titulo: textos.titulo,
    selos: selosComLocal(textos.selos, textos.local),
    argumentos: textos.argumentos,
    fotosPorSlide: textos.fotosPorSlide,
  });
  await prisma.$transaction([
    prisma.postagemArte.deleteMany({ where: { postagemId } }),
    prisma.postagemArte.createMany({
      data: artes.map((a, ordem) => ({ postagemId, ordem, formato: a.formato, dados: a.dados as unknown as Prisma.InputJsonValue })),
    }),
    prisma.postagem.update({
      where: { id: postagemId },
      data: {
        // Artes refeitas: o que foi aprovado (ou agendado) mudou — volta pra revisão.
        ...(["RASCUNHO", "APROVADO", "AGENDADO"].includes(p.status) && { status: "AGUARDANDO_APROVACAO" as const, agendadaPara: null }),
        headline: textos.titulo.filter(Boolean).join(" "),
      },
    }),
  ]);
  return artes.length;
}

/** JPEG da arte: desenha na primeira vez (ou depois de uma mudança) e guarda. */
export async function imagemDaArte(arteId: string): Promise<{ buffer: Buffer; numero: number; ordem: number } | null> {
  const arte = await prisma.postagemArte.findUnique({
    where: { id: arteId },
    select: { id: true, imagem: true, dados: true, ordem: true, atualizadoEm: true, postagem: { select: { numero: true } } },
  });
  if (!arte) return null;
  if (arte.imagem) return { buffer: Buffer.from(arte.imagem), numero: arte.postagem.numero, ordem: arte.ordem };
  const dados = arte.dados as unknown as DadosArte;
  const ids = [...new Set(dados.fotos.map((f) => f.imagemId))];
  const fotos = await prisma.postagemImagem.findMany({ where: { id: { in: ids } }, select: { id: true, imagemTratada: true, imagemOriginal: true } });
  const mapa = new Map(fotos.map((f) => [f.id, Buffer.from(f.imagemTratada ?? f.imagemOriginal)]));
  const buffer = await renderizarArte(dados, mapa);
  // Só grava se a arte não mudou enquanto desenhava (senão a imagem velha
  // ficaria por cima dos dados novos).
  await prisma.postagemArte.updateMany({
    where: { id: arte.id, imagem: null, atualizadoEm: arte.atualizadoEm },
    data: { imagem: new Uint8Array(buffer), renderizadaEm: new Date() },
  });
  return { buffer, numero: arte.postagem.numero, ordem: arte.ordem };
}

// Sem a cidade da fábrica aqui de propósito: no teste de 17/10 a IA pôs
// #SantaRosaRS num post sem cidade informada, como se a obra fosse lá.
const REGRAS_LEGENDA = `Você escreve a legenda de posts do Instagram da Legaus Kids, fábrica de playgrounds e brinquedos infantis.

Regras (aprovadas pelo dono da empresa):
- Tom alegre, próximo e confiável. Frases curtas. No máximo 1 ou 2 emojis.
- Estrutura, nesta ordem: 1) um gancho; 2) o que foi entregue ou mostrado — só fatos; 3) a chamada "Chama no WhatsApp!" (pode vir depois de uma pergunta, como no exemplo); 4) de 4 a 6 hashtags, sempre incluindo #LegausKids #BrincadeiraLevadaASerio.
- NUNCA invente fatos: cliente, cidade, preço ou itens do brinquedo só entram se foram informados abaixo ou se aparecem com clareza nas fotos. Na dúvida, deixe de fora.
- Hashtag de cidade ou região só se a cidade foi informada abaixo. Também não diga o tipo de lugar (escola, condomínio, praça) se não foi informado.
- Toda frase começa com letra maiúscula.
- Escreva só a legenda pronta, sem explicações e sem aspas.

Exemplo aprovado:
Mais um playground entregue! 🎉
Torre com escorregador e tubo, balanço duplo e gangorras com balanço, tudo pronto pra muita brincadeira com segurança.

Quer um playground assim no seu espaço? Chama no WhatsApp!

#LegausKids #BrincadeiraLevadaASerio #Playground #Parquinho #DiversaoGarantida`;

const DESCRICAO_CONTEUDO: Record<ConteudoPostagem, string> = {
  ENTREGA: "Entrega de obra pronta (carrossel com as fotos da obra).",
  INSTALACAO: "Instalação em andamento (story).",
  TBT: "TBT, relembrando uma obra antiga (story).",
  PRODUTO: "Produto / oferta, com o preço no selo.",
  BENEFICIOS: "Benefícios da Legaus Kids (carrossel com um argumento por slide).",
};

/** Legenda sugerida pela IA com as regras da marca, olhando as fotos. Só sugestão: passa pela aprovação. */
export async function gerarLegendaDaPostagem(postagemId: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const p = await prisma.postagem.findUniqueOrThrow({
    where: { id: postagemId },
    select: {
      conteudo: true,
      produto: true,
      cliente: true,
      cidade: true,
      contexto: true,
      textos: true,
      imagens: { orderBy: { ordem: "asc" }, take: 4, select: { imagemTratada: true, imagemOriginal: true } },
    },
  });
  if (SO_STORY.includes(p.conteudo)) return null;
  const textos = textosDa(p);
  const fatos = [
    `Tipo de post: ${DESCRICAO_CONTEUDO[p.conteudo]}`,
    p.produto && `O que é: ${p.produto}`,
    p.cliente && `Cliente: ${p.cliente}`,
    p.cidade && `Cidade: ${p.cidade}`,
    textos.local && `Local da obra (vai num selo da arte): ${textos.local}`,
    textos.preco && `Preço: ${textos.preco}`,
    textos.argumentos?.length && `Argumentos dos slides: ${textos.argumentos.join("; ")}`,
    p.contexto && `Observações de quem enviou: ${p.contexto}`,
  ].filter(Boolean);

  const fotos = await Promise.all(
    p.imagens.map(async (i) =>
      (await sharp(Buffer.from(i.imagemTratada ?? i.imagemOriginal)).resize({ width: 768, height: 768, fit: "inside" }).jpeg({ quality: 80 }).toBuffer()).toString("base64"),
    ),
  );
  try {
    const client = new Anthropic({ apiKey });
    const resposta = await client.messages.create({
      model: MODELO_IA,
      max_tokens: 500,
      system: REGRAS_LEGENDA,
      messages: [
        {
          role: "user",
          content: [
            ...fotos.map((data) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data } })),
            { type: "text" as const, text: `Fotos reais do post acima. Fatos informados:\n${fatos.join("\n")}\n\nEscreva a legenda.` },
          ],
        },
      ],
    });
    const legenda = resposta.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!legenda) return null;
    await prisma.postagem.update({ where: { id: postagemId }, data: { legenda } });
    return legenda;
  } catch (erro) {
    console.error(`[marketing] legenda do post ${postagemId}: ${erro instanceof Error ? erro.message : erro}`);
    return null;
  }
}

/** Troca título/selos/argumentos e remonta as artes (as posições voltam pro padrão). */
export async function atualizarTextosPostagem(postagemId: string, textos: TextosPostagem) {
  await prisma.postagem.update({ where: { id: postagemId }, data: { textos: textos as unknown as Prisma.InputJsonValue } });
  return montarArtesDaPostagem(postagemId);
}

/**
 * Refaz só os slides do carrossel com 1 ou 2 fotos cada (pedido do Marcos de
 * 2026-10-21: "um slide pra cada foto") — a capa e o story ficam como estão,
 * com os ajustes feitos. Entram nos slides todas as fotos do post menos a da
 * capa. Post aprovado volta pra revisão.
 */
export async function trocarFotosPorSlide(postagemId: string, porSlide: FotosPorSlide): Promise<{ slides: number; foraDoCarrossel: number }> {
  const p = await prisma.postagem.findUniqueOrThrow({
    where: { id: postagemId },
    select: {
      conteudo: true,
      produto: true,
      status: true,
      textos: true,
      imagens: { orderBy: { ordem: "asc" }, select: { id: true, largura: true, altura: true } },
      artes: { orderBy: { ordem: "asc" }, select: { id: true, formato: true, dados: true } },
    },
  });
  if (p.conteudo !== "ENTREGA") throw new Error("Só o post de entrega tem slides com as fotos da obra.");
  const capa = p.artes.find((a) => a.formato === "FEED");
  const story = p.artes.find((a) => a.formato === "STORY");
  if (!capa) throw new Error("O post está sem capa — refaça as artes.");
  const capaId = (capa.dados as unknown as DadosArte).fotos[0]?.imagemId ?? "";
  const { slides, foraDoCarrossel } = slidesDasFotos(
    p.imagens.map((i) => ({ id: i.id, largura: i.largura ?? 1, altura: i.altura ?? 1 })),
    capaId,
    porSlide,
  );
  const textos = { ...textosDa(p), fotosPorSlide: porSlide };
  const antigos = p.artes.filter((a) => a.formato === "FEED" && a.id !== capa.id).map((a) => a.id);
  await prisma.$transaction([
    prisma.postagemArte.deleteMany({ where: { id: { in: antigos } } }),
    prisma.postagemArte.createMany({
      data: slides.map((dados, i) => ({ postagemId, ordem: i + 1, formato: "FEED" as const, dados: dados as unknown as Prisma.InputJsonValue })),
    }),
    ...(story ? [prisma.postagemArte.update({ where: { id: story.id }, data: { ordem: slides.length + 1 } })] : []),
    prisma.postagem.update({
      where: { id: postagemId },
      data: {
        textos: textos as unknown as Prisma.InputJsonValue,
        ...((p.status === "APROVADO" || p.status === "AGENDADO") && { status: "AGUARDANDO_APROVACAO" as const, agendadaPara: null }),
      },
    }),
  ]);
  return { slides: slides.length, foraDoCarrossel };
}

export function listarPostagens() {
  return prisma.postagem.findMany({
    orderBy: { criadoEm: "desc" },
    take: 100,
    select: {
      id: true,
      numero: true,
      conteudo: true,
      status: true,
      headline: true,
      cliente: true,
      cidade: true,
      criadoEm: true,
      agendadaPara: true,
      publicadaEm: true,
      criadoPor: { select: { nome: true } },
      artes: { orderBy: { ordem: "asc" }, take: 1, select: { id: true, atualizadoEm: true } },
      _count: { select: { artes: true, imagens: true } },
    },
  });
}

export function buscarPostagem(id: string) {
  return prisma.postagem.findUnique({
    where: { id },
    select: {
      id: true,
      numero: true,
      conteudo: true,
      status: true,
      legenda: true,
      produto: true,
      cliente: true,
      cidade: true,
      contexto: true,
      textos: true,
      criadoEm: true,
      agendadaPara: true,
      publicadaEm: true,
      publicarNoInstagram: true,
      publicarNoFacebook: true,
      publicacao: true,
      erroPublicacao: true,
      criadoPor: { select: { nome: true } },
      negocio: { select: { id: true, titulo: true } },
      imagens: { orderBy: { ordem: "asc" }, select: { id: true, largura: true, altura: true } },
      artes: { orderBy: { ordem: "asc" }, select: { id: true, ordem: true, formato: true, atualizadoEm: true } },
    },
  });
}

/** Foto do post como entra nas artes (a tratada; a original só se não houver). */
export async function buscarFotoDoPost(id: string): Promise<{ buffer: Buffer; mime: string } | null> {
  const f = await prisma.postagemImagem.findUnique({ where: { id }, select: { imagemTratada: true, imagemOriginal: true, imagemOriginalMime: true } });
  if (!f) return null;
  return f.imagemTratada ? { buffer: Buffer.from(f.imagemTratada), mime: "image/jpeg" } : { buffer: Buffer.from(f.imagemOriginal), mime: f.imagemOriginalMime };
}

/** Tudo que o editor de uma arte precisa (etapa 2). */
export async function buscarArteParaEditor(arteId: string) {
  const arte = await prisma.postagemArte.findUnique({
    where: { id: arteId },
    select: {
      id: true,
      ordem: true,
      formato: true,
      dados: true,
      atualizadoEm: true,
      postagem: {
        select: {
          id: true,
          numero: true,
          conteudo: true,
          status: true,
          imagens: { orderBy: { ordem: "asc" }, select: { id: true, largura: true, altura: true } },
          artes: { orderBy: { ordem: "asc" }, select: { id: true, ordem: true, formato: true } },
        },
      },
    },
  });
  if (!arte) return null;
  return { ...arte, dados: arte.dados as unknown as DadosArte };
}

/**
 * Salva os ajustes do editor — conferidos contra a arte guardada
 * (sanitizarDadosArte) — e apaga o JPEG pra ser desenhado de novo. Post já
 * aprovado volta pra revisão: o que foi aprovado mudou.
 */
export async function salvarDadosArte(arteId: string, enviada: Partial<DadosArte>) {
  const arte = await prisma.postagemArte.findUniqueOrThrow({
    where: { id: arteId },
    select: { dados: true, postagemId: true, postagem: { select: { status: true, imagens: { select: { id: true } } } } },
  });
  const dados = sanitizarDadosArte(arte.dados as unknown as DadosArte, enviada, arte.postagem.imagens.map((i) => i.id));
  const voltaPraRevisao = arte.postagem.status === "APROVADO" || arte.postagem.status === "AGENDADO";
  await prisma.$transaction([
    prisma.postagemArte.update({ where: { id: arteId }, data: { dados: dados as unknown as Prisma.InputJsonValue, imagem: null, renderizadaEm: null } }),
    ...(voltaPraRevisao ? [prisma.postagem.update({ where: { id: arte.postagemId }, data: { status: "AGUARDANDO_APROVACAO", agendadaPara: null } })] : []),
  ]);
  return { postagemId: arte.postagemId, voltouPraRevisao: voltaPraRevisao };
}

export async function atualizarLegendaPostagem(id: string, legenda: string): Promise<void> {
  await prisma.postagem.update({ where: { id }, data: { legenda } });
}

/** Não mexe em post que está saindo agora; sair de AGENDADO desfaz o agendamento. Devolve se mudou. */
export async function atualizarStatusPostagem(id: string, status: StatusPostagem): Promise<boolean> {
  const r = await prisma.postagem.updateMany({
    where: { id, status: { notIn: ["PUBLICANDO", "PUBLICADO"] } },
    data: { status, ...(status === "AGENDADO" ? {} : { agendadaPara: null }) },
  });
  return r.count === 1;
}

export async function excluirPostagem(id: string): Promise<void> {
  await prisma.postagem.delete({ where: { id } });
}
