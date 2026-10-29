import "server-only";
import type { Prisma, StatusPostagem } from "@prisma/client";
import { prisma } from "@/lib/db";
import { URL_BASE } from "@/lib/constants/app";
import { assinar } from "@/lib/server/cripto";
import { imagemDaArte } from "@/lib/server/marketing";
import { ErroMeta, graph, obterConexao, verificarConexao, type ConexaoAtiva } from "@/lib/server/meta";
import { destinatarioDosAvisos } from "@/lib/server/push-bancario";
import { enviarRespostaTelegram } from "@/lib/server/telegram";
import { MAX_IMAGENS_CARROSSEL, nadaPendente, partesPendentes, type PublicacaoMeta } from "@/lib/utils/meta-publicacao";

// Publica um post aprovado na Meta (etapa 3, aprovada em 2026-10-21):
// Instagram (carrossel ou foto única no feed + story) e Página do Facebook
// (post com as fotos do carrossel). A Meta baixa cada JPEG por um link
// público assinado que vale 2 h (/api/imagem/arte-publica). O que já saiu
// fica salvo em Postagem.publicacao a cada parte: "tentar de novo" só refaz
// o que falhou. Nada é publicado sem o post estar aprovado — quem decide é o
// Marcos, no botão (ou agendando).

const FINALIDADE_LINK = "arte-publica";
const VALIDADE_LINK_S = 2 * 60 * 60;

export function urlPublicaDaArte(arteId: string): string {
  const exp = Math.floor(Date.now() / 1000) + VALIDADE_LINK_S;
  return `${URL_BASE}/api/imagem/arte-publica/${arteId}?exp=${exp}&sig=${assinar(`${arteId}.${exp}`, FINALIDADE_LINK)}`;
}

export { FINALIDADE_LINK };

/** Passa o post pra PUBLICANDO se ele estiver num dos estados pedidos (vale como trava contra publicar duas vezes). */
export async function reivindicarParaPublicar(postagemId: string, de: StatusPostagem[]): Promise<boolean> {
  const r = await prisma.postagem.updateMany({ where: { id: postagemId, status: { in: de } }, data: { status: "PUBLICANDO", erroPublicacao: null } });
  return r.count === 1;
}

const APROVADOS: StatusPostagem[] = ["APROVADO", "AGENDADO", "ERRO"];

/**
 * O story foi postado à mão pelo celular, com música do Instagram (a API não
 * põe música — pedido de 2026-10-29). Fica registrado e o CRM não publica o
 * story de novo; se não sobrar nada (post só de story, ou feed já publicado),
 * o post vira PUBLICADO e sai do agendamento.
 */
export async function registrarStoryPeloCelular(postagemId: string): Promise<{ ok: true; terminou: boolean } | { ok: false; error: string }> {
  const post = await prisma.postagem.findUnique({
    where: { id: postagemId },
    select: { status: true, publicacao: true, publicarNoInstagram: true, publicarNoFacebook: true, artes: { select: { formato: true } } },
  });
  if (!post) return { ok: false, error: "Post não encontrado." };
  if (!APROVADOS.includes(post.status)) {
    const motivo = { PUBLICANDO: "O post está sendo publicado agora — espere terminar.", PUBLICADO: "Esse post já está publicado." } as Partial<Record<StatusPostagem, string>>;
    return { ok: false, error: motivo[post.status] ?? "Aprove o post antes de postar o story." };
  }
  const feed = post.artes.filter((a) => a.formato === "FEED").length;
  const story = post.artes.filter((a) => a.formato === "STORY").length;
  if (story === 0) return { ok: false, error: "Esse post não tem story." };

  const anterior: PublicacaoMeta = (post.publicacao as PublicacaoMeta | null) ?? {};
  const feito: PublicacaoMeta = { ...anterior, instagram: { ...anterior.instagram, storyPeloCelularEm: new Date().toISOString() } };
  const terminou = nadaPendente(partesPendentes({ feed, story }, { instagram: post.publicarNoInstagram, facebook: post.publicarNoFacebook && feed > 0 }, feito));
  const r = await prisma.postagem.updateMany({
    where: { id: postagemId, status: post.status },
    data: {
      publicacao: feito as unknown as Prisma.InputJsonValue,
      ...(terminou && { status: "PUBLICADO" as const, publicadaEm: new Date(), agendadaPara: null, erroPublicacao: null }),
    },
  });
  if (r.count !== 1) return { ok: false, error: "O post mudou enquanto isso — recarregue a página." };
  return { ok: true, terminou };
}

const esperar =(ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Acesso expirado/revogado (código 190): as outras partes vão falhar igual — para na primeira. */
const acessoCaiu = (e: unknown) => e instanceof ErroMeta && e.codigo === 190;

/** O Instagram processa o contêiner antes de publicar: espera ficar pronto (imagem costuma ser na hora). */
async function esperarConteiner(id: string, token: string): Promise<void> {
  for (let i = 0; i < 15; i++) {
    const r = await graph<{ status_code?: string }>(`/${id}`, { fields: "status_code", access_token: token });
    if (r.status_code === "FINISHED" || r.status_code === undefined) return;
    if (r.status_code === "ERROR" || r.status_code === "EXPIRED") throw new Error(`O Instagram não aceitou a imagem (${r.status_code}).`);
    await esperar(2000);
  }
  throw new Error("O Instagram demorou demais pra processar as imagens — tente de novo.");
}

async function publicarFeedInstagram(conexao: ConexaoAtiva, urls: string[], legenda: string): Promise<{ id: string; link: string | null }> {
  const ig = conexao.instagramId as string;
  const token = conexao.token;
  let conteiner: string;
  if (urls.length === 1) {
    conteiner = (await graph<{ id: string }>(`/${ig}/media`, { image_url: urls[0], caption: legenda, access_token: token }, "POST")).id;
  } else {
    const filhos: string[] = [];
    for (const url of urls.slice(0, MAX_IMAGENS_CARROSSEL)) {
      filhos.push((await graph<{ id: string }>(`/${ig}/media`, { image_url: url, is_carousel_item: "true", access_token: token }, "POST")).id);
    }
    for (const filho of filhos) await esperarConteiner(filho, token);
    conteiner = (await graph<{ id: string }>(`/${ig}/media`, { media_type: "CAROUSEL", children: filhos.join(","), caption: legenda, access_token: token }, "POST")).id;
  }
  await esperarConteiner(conteiner, token);
  const publicado = await graph<{ id: string }>(`/${ig}/media_publish`, { creation_id: conteiner, access_token: token }, "POST");
  const link = await graph<{ permalink?: string }>(`/${publicado.id}`, { fields: "permalink", access_token: token })
    .then((r) => r.permalink ?? null)
    .catch(() => null);
  return { id: publicado.id, link };
}

async function publicarStoryInstagram(conexao: ConexaoAtiva, url: string): Promise<string> {
  const ig = conexao.instagramId as string;
  const conteiner = (await graph<{ id: string }>(`/${ig}/media`, { image_url: url, media_type: "STORIES", access_token: conexao.token }, "POST")).id;
  await esperarConteiner(conteiner, conexao.token);
  return (await graph<{ id: string }>(`/${ig}/media_publish`, { creation_id: conteiner, access_token: conexao.token }, "POST")).id;
}

async function publicarNaPagina(conexao: ConexaoAtiva, urls: string[], legenda: string): Promise<{ id: string; link: string | null }> {
  const fotos: string[] = [];
  for (const url of urls.slice(0, MAX_IMAGENS_CARROSSEL)) {
    fotos.push((await graph<{ id: string }>(`/${conexao.paginaId}/photos`, { url, published: "false", access_token: conexao.token }, "POST")).id);
  }
  const parametros: Record<string, string> = { message: legenda, access_token: conexao.token };
  fotos.forEach((id, i) => (parametros[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
  const post = await graph<{ id: string }>(`/${conexao.paginaId}/feed`, parametros, "POST");
  const link = await graph<{ permalink_url?: string }>(`/${post.id}`, { fields: "permalink_url", access_token: conexao.token })
    .then((r) => r.permalink_url ?? null)
    .catch(() => null);
  return { id: post.id, link };
}

async function avisarNoTelegram(mensagem: string): Promise<void> {
  try {
    const destino = await destinatarioDosAvisos();
    if (destino?.telegramId) await enviarRespostaTelegram(destino.telegramId, { mensagem });
  } catch (erro) {
    console.error(`[meta] não consegui avisar no Telegram: ${erro instanceof Error ? erro.message : erro}`);
  }
}

/**
 * Publica o que falta do post (que já deve estar em PUBLICANDO — ver
 * reivindicarParaPublicar). Termina em PUBLICADO ou ERRO, salvando cada parte
 * que saiu, e avisa no Telegram.
 */
export async function publicarPostagem(postagemId: string): Promise<{ ok: boolean; mensagem: string }> {
  const post = await prisma.postagem.findUniqueOrThrow({
    where: { id: postagemId },
    select: {
      numero: true,
      legenda: true,
      publicacao: true,
      publicarNoInstagram: true,
      publicarNoFacebook: true,
      artes: { orderBy: { ordem: "asc" }, select: { id: true, formato: true } },
    },
  });
  const feito: PublicacaoMeta = (post.publicacao as PublicacaoMeta | null) ?? {};
  const salvar = () => prisma.postagem.update({ where: { id: postagemId }, data: { publicacao: feito as unknown as Prisma.InputJsonValue } });
  const falhas: string[] = [];
  const saiu: string[] = [];

  try {
    const conexao = await obterConexao();
    if (!conexao) throw new Error("O CRM não está conectado à Meta — conecte em Configurações → Instagram e Facebook.");
    const feed = post.artes.filter((a) => a.formato === "FEED");
    const stories = post.artes.filter((a) => a.formato === "STORY");
    // Na Página vão as fotos do feed: post só de story não vai pro Facebook.
    const destinos = { instagram: post.publicarNoInstagram && Boolean(conexao.instagramId), facebook: post.publicarNoFacebook && conexao.podeFacebook && feed.length > 0 };
    const pendente = partesPendentes({ feed: feed.length, story: stories.length }, destinos, feito);
    if (post.publicarNoInstagram && !conexao.instagramId) falhas.push("Instagram: a Página conectada não tem Instagram ligado");
    if (post.publicarNoFacebook && feed.length > 0 && !conexao.podeFacebook) falhas.push("Facebook: falta a permissão pages_manage_posts no app (passo 4.9)");
    if (!destinos.instagram && !destinos.facebook) throw new Error(falhas.join(" · ") || "Nenhuma rede marcada pra publicar.");

    // A Meta baixa as imagens na hora: desenha antes pra ela não esperar.
    for (const arte of post.artes) await imagemDaArte(arte.id);
    const legenda = post.legenda ?? "";

    if (pendente.instagramFeed) {
      try {
        const r = await publicarFeedInstagram(conexao, feed.map((a) => urlPublicaDaArte(a.id)), legenda);
        feito.instagram = { ...feito.instagram, feedId: r.id, feedLink: r.link ?? undefined };
        await salvar();
        saiu.push(`Instagram (${feed.length > 1 ? `carrossel de ${Math.min(feed.length, MAX_IMAGENS_CARROSSEL)}` : "foto"})`);
      } catch (e) {
        if (acessoCaiu(e)) throw e;
        falhas.push(`Instagram feed: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (pendente.instagramStory) {
      for (const [i, arte] of stories.entries()) {
        if (feito.instagram?.storyIds?.[i]) continue;
        try {
          const id = await publicarStoryInstagram(conexao, urlPublicaDaArte(arte.id));
          feito.instagram = { ...feito.instagram, storyIds: [...(feito.instagram?.storyIds ?? []), id] };
          await salvar();
          saiu.push("story do Instagram");
        } catch (e) {
          if (acessoCaiu(e)) throw e;
          falhas.push(`Story: ${e instanceof Error ? e.message : e}`);
          break;
        }
      }
    }
    if (pendente.facebook) {
      try {
        const r = await publicarNaPagina(conexao, feed.map((a) => urlPublicaDaArte(a.id)), legenda);
        feito.facebook = { postId: r.id, link: r.link ?? undefined };
        await salvar();
        saiu.push("Página do Facebook");
      } catch (e) {
        if (acessoCaiu(e)) throw e;
        falhas.push(`Facebook: ${e instanceof Error ? e.message : e}`);
      }
    }

    const restante = partesPendentes({ feed: feed.length, story: stories.length }, destinos, feito);
    const tudoCerto = nadaPendente(restante) && !falhas.some((f) => !f.startsWith("Facebook: falta") && !f.startsWith("Instagram: a Página"));
    await prisma.postagem.update({
      where: { id: postagemId },
      data: tudoCerto
        ? { status: "PUBLICADO", publicadaEm: new Date(), agendadaPara: null, erroPublicacao: falhas.length ? falhas.join(" · ") : null }
        : { status: "ERRO", erroPublicacao: falhas.join(" · ") || "A publicação não terminou." },
    });
    const link = [feito.instagram?.feedLink, feito.facebook?.link].filter(Boolean).join("\n");
    const mensagem = tudoCerto
      ? `✅ Post #${post.numero} publicado${saiu.length ? `: ${saiu.join(", ")}` : ""}.${link ? `\n${link}` : ""}${falhas.length ? `\n⚠️ ${falhas.join(" · ")}` : ""}`
      : `⚠️ Post #${post.numero}: a publicação não terminou.${saiu.length ? ` Saiu: ${saiu.join(", ")}.` : ""}\n${falhas.join("\n")}\nAbra o post no CRM e toque em Tentar de novo (só refaz o que falhou).`;
    await avisarNoTelegram(mensagem);
    return { ok: tudoCerto, mensagem };
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "Falha desconhecida.";
    // Configurações → Instagram e Facebook passa a mostrar a conexão com problema.
    if (acessoCaiu(e)) await prisma.conexaoMeta.updateMany({ where: { id: "principal" }, data: { erro: motivo, verificadoEm: new Date() } });
    await prisma.postagem.update({ where: { id: postagemId }, data: { status: "ERRO", erroPublicacao: motivo, publicacao: feito as unknown as Prisma.InputJsonValue } });
    const mensagem = `⚠️ Post #${post.numero} não foi publicado${saiu.length ? ` por inteiro (saiu: ${saiu.join(", ")})` : ""}: ${motivo}`;
    await avisarNoTelegram(mensagem);
    return { ok: false, mensagem };
  }
}

const PRAZO_RELOGIO_MS = 200_000;
/** PUBLICANDO por mais que isso = a publicação caiu no meio (função cortada). */
const PUBLICANDO_TRAVADO_MS = 15 * 60 * 1000;
const VERIFICAR_CONEXAO_MS = 20 * 60 * 60 * 1000;

/**
 * Chamado a cada minuto pelo relógio (o whatsapp-service do servidor da
 * Legaus): publica os agendados que venceram, destrava publicação que caiu
 * e testa a conexão uma vez por dia (avisa no Telegram se caiu).
 */
export async function rodarRelogioDePublicacao(): Promise<{ publicados: number; erros: number; verificou: boolean }> {
  const inicio = Date.now();
  await prisma.postagem.updateMany({
    where: { status: "PUBLICANDO", atualizadoEm: { lt: new Date(Date.now() - PUBLICANDO_TRAVADO_MS) } },
    data: { status: "ERRO", erroPublicacao: "A publicação foi interrompida no meio — confira no Instagram/Facebook o que saiu e toque em Tentar de novo." },
  });

  let publicados = 0;
  let erros = 0;
  const vencidos = await prisma.postagem.findMany({ where: { status: "AGENDADO", agendadaPara: { lte: new Date() } }, orderBy: { agendadaPara: "asc" }, select: { id: true } });
  for (const { id } of vencidos) {
    if (Date.now() - inicio > PRAZO_RELOGIO_MS) break;
    if (!(await reivindicarParaPublicar(id, ["AGENDADO"]))) continue;
    const r = await publicarPostagem(id);
    if (r.ok) publicados++;
    else erros++;
  }

  let verificou = false;
  const conexao = await prisma.conexaoMeta.findUnique({ where: { id: "principal" }, select: { verificadoEm: true, erro: true } });
  if (conexao && (!conexao.verificadoEm || Date.now() - conexao.verificadoEm.getTime() > VERIFICAR_CONEXAO_MS)) {
    verificou = true;
    const r = await verificarConexao();
    if (!r.ok && !conexao.erro) await avisarNoTelegram(`⚠️ A conexão do CRM com o Instagram/Facebook caiu: ${r.erro}\nReconecte em Configurações → Instagram e Facebook.`);
  }
  return { publicados, erros, verificou };
}
