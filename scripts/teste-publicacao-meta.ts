// Publicação na Meta (etapa 3 dos posts, 2026-10-21) com a Graph API e o
// Telegram SIMULADOS — nada sai de verdade no Instagram, no Facebook nem no
// Telegram. Usa o banco de verdade: cria a conexão e um post de teste com
// fotos geradas na hora, e apaga os dois no fim. Não roda se já existir uma
// conexão real com a Meta (pra não sobrescrever). Rodar:
// npx tsx --conditions=react-server --env-file=.env scripts/teste-publicacao-meta.ts
import sharp from "sharp";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { adicionarFoto, criarPostagem, excluirPostagem, montarArtesDaPostagem } from "@/lib/server/marketing";
import { conectarMeta, desconectarMeta, obterConexao } from "@/lib/server/meta";
import { publicarPostagem, reivindicarParaPublicar, rodarRelogioDePublicacao, urlPublicaDaArte } from "@/lib/server/meta-publicacao";
import { GET as artePublica } from "@/app/api/imagem/arte-publica/[id]/route";
import type { PublicacaoMeta } from "@/lib/utils/meta-publicacao";

let falhas = 0;
const checar = (c: unknown, m: string) => {
  console.log(`${c ? "ok  " : "FALHOU"} ${m}`);
  if (!c) falhas++;
};

// ---------- Meta e Telegram de mentira ----------
type Chamada = { metodo: string; caminho: string; p: Record<string, string> };
const chamadas: Chamada[] = [];
const telegram: string[] = [];
const cenario = {
  permissoes: ["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement", "business_management", "pages_manage_posts"],
  falharFeedDaPagina: false,
  tokenValido: true,
  outraPaginaComInstagram: true,
  acessoRevogado: false,
};
let seq = 0;
const statusConsultado = new Set<string>();
const fetchOriginal = globalThis.fetch;
// O envio pro Telegram é simulado aqui embaixo; o .env local não tem o token do bot.
process.env.TELEGRAM_BOT_TOKEN ||= "teste:falso";

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

async function graphFalsa(url: URL, init?: RequestInit): Promise<Response> {
  const metodo = init?.method ?? "GET";
  const p = Object.fromEntries(metodo === "GET" ? url.searchParams : new URLSearchParams(String(init?.body ?? "")));
  const caminho = url.pathname.replace(/^\/v\d+\.\d+/, "");
  chamadas.push({ metodo, caminho, p });
  if (cenario.acessoRevogado && caminho !== "/debug_token") return json({ error: { message: "Error validating access token: The session has been invalidated", code: 190 } }, 400);
  if (caminho === "/oauth/access_token") return json({ access_token: "LONGO-123", token_type: "bearer", expires_in: 5184000 });
  if (caminho === "/me/permissions") return json({ data: cenario.permissoes.map((permission) => ({ permission, status: "granted" })) });
  if (caminho === "/me/accounts")
    return json({
      data: [
        { id: "PAG1", name: "Legaus Kids", access_token: "TOKEN-PAGINA-LEGAUS", instagram_business_account: { id: "IG1", username: "legauskids" } },
        { id: "PAG2", name: "Outra Página", access_token: "TOKEN-OUTRA", ...(cenario.outraPaginaComInstagram ? { instagram_business_account: { id: "IG2", username: "outra" } } : {}) },
      ],
    });
  if (caminho === "/debug_token")
    return json({ data: { is_valid: cenario.tokenValido, expires_at: 0, type: p.input_token?.startsWith("SISTEMA") ? "SYSTEM_USER" : p.input_token?.startsWith("EAA") ? "USER" : "PAGE" } });
  if (caminho === "/IG1/media" && metodo === "POST") return json({ id: `cont-${++seq}` });
  if (caminho === "/IG1/media_publish") return json({ id: `igpost-${++seq}` });
  if (caminho === "/IG1") return json({ id: "IG1", username: "legauskids" });
  if (caminho === "/PAG1/photos") return json({ id: `foto-${++seq}` });
  if (caminho === "/PAG1/feed") {
    if (cenario.falharFeedDaPagina) return json({ error: { message: "(#200) Permissions error", code: 200 } }, 400);
    return json({ id: `PAG1_post-${++seq}` });
  }
  const id = caminho.slice(1);
  if (p.fields === "status_code") {
    // A primeira consulta de cada contêiner ainda está processando.
    const primeira = !statusConsultado.has(id);
    statusConsultado.add(id);
    return json({ id, status_code: primeira && id === "cont-1" ? "IN_PROGRESS" : "FINISHED" });
  }
  if (p.fields === "permalink") return json({ id, permalink: `https://www.instagram.com/p/${id}/` });
  if (p.fields === "permalink_url") return json({ id, permalink_url: `https://www.facebook.com/${id}` });
  return json({ error: { message: `rota falsa sem resposta: ${metodo} ${caminho}`, code: 1 } }, 400);
}

globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
  if (url.hostname === "graph.facebook.com") return graphFalsa(url, init);
  if (url.hostname === "api.telegram.org") {
    const corpo = JSON.parse(String(init?.body ?? "{}")) as { text?: string };
    if (corpo.text) telegram.push(corpo.text);
    return json({ ok: true, result: { message_id: telegram.length } });
  }
  return fetchOriginal(entrada, init);
}) as typeof fetch;

const midiaIG = () => chamadas.filter((c) => c.caminho === "/IG1/media");
const feedPagina = () => chamadas.filter((c) => c.caminho === "/PAG1/feed");

async function fotoDeTeste(cor: string) {
  return sharp({ create: { width: 1600, height: 1200, channels: 3, background: cor } }).jpeg().toBuffer();
}

async function main() {
  if (await prisma.conexaoMeta.findUnique({ where: { id: "principal" } })) {
    throw new Error("Já existe uma conexão real com a Meta — o teste não roda pra não sobrescrever.");
  }
  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) throw new Error("Falta META_APP_ID / META_APP_SECRET no .env.");
  const marcos = await prisma.user.findFirstOrThrow({ where: { username: "marcos" } });
  let postId: string | null = null;

  try {
    // 1. Conectar: duas Páginas → pergunta qual; depois guarda o acesso da Página cifrado.
    const r1 = await conectarMeta("EAA-curto-de-teste-0123456789", marcos.id);
    checar("escolher" in r1 && r1.escolher.length === 2, "acesso que vê 2 Páginas com Instagram: pergunta qual é a da Legaus");
    const r2 = await conectarMeta("EAA-curto-de-teste-0123456789", marcos.id, "PAG1");
    checar("ok" in r2 && r2.ok && r2.paginaNome === "Legaus Kids" && r2.instagramUsuario === "legauskids" && r2.faltando.length === 0 && r2.naoVence, "conecta a Página da Legaus com o Instagram, sem faltar permissão");
    cenario.outraPaginaComInstagram = false;
    const r3 = await conectarMeta("EAA-curto-de-teste-0123456789", marcos.id);
    checar("ok" in r3 && r3.paginaNome === "Legaus Kids", "só uma das Páginas tem Instagram: escolhe ela sozinho");
    const guardada = await prisma.conexaoMeta.findUniqueOrThrow({ where: { id: "principal" } });
    checar(!guardada.paginaToken.includes("TOKEN-PAGINA") && guardada.paginaToken.startsWith("v1:"), "o acesso da Página fica cifrado no banco");
    const trocasAntes = chamadas.filter((c) => c.caminho === "/oauth/access_token").length;
    const sistema = await conectarMeta("SISTEMA-token-do-business-suite-0123", marcos.id);
    checar("ok" in sistema && sistema.paginaNome === "Legaus Kids" && chamadas.filter((c) => c.caminho === "/oauth/access_token").length === trocasAntes, "token de usuário do sistema (Business Suite): conecta direto, sem troca");
    const conexao = await obterConexao();
    checar(conexao?.token === "TOKEN-PAGINA-LEGAUS" && conexao.podeFacebook && conexao.instagramId === "IG1", "e volta decifrado só pra quem publica");
    const troca = chamadas.find((c) => c.caminho === "/oauth/access_token");
    checar(troca?.p.grant_type === "fb_exchange_token" && troca.p.client_id === process.env.META_APP_ID, "troca o acesso curto por um longo com o app Legaus Kids CRM");

    // 2. Post de entrega aprovado (fotos geradas na hora).
    const post = await criarPostagem({ conteudo: "ENTREGA", produto: "playground", contexto: "[TESTE] publicação simulada", criadoPorId: marcos.id, fotosPorSlide: 1 });
    postId = post.id;
    for (const cor of ["#e85d2a", "#2a8fe8", "#3cb371"]) await adicionarFoto(post.id, await fotoDeTeste(cor), "image/jpeg");
    await montarArtesDaPostagem(post.id);
    await prisma.postagem.update({ where: { id: post.id }, data: { legenda: "Legenda de teste #LegausKids", status: "APROVADO" } });
    const artes = await prisma.postagemArte.findMany({ where: { postagemId: post.id }, orderBy: { ordem: "asc" }, select: { id: true, formato: true } });
    const feed = artes.filter((a) => a.formato === "FEED");
    const stories = artes.filter((a) => a.formato === "STORY");
    checar(feed.length >= 2 && stories.length === 1, `post de teste: ${feed.length} artes de feed + ${stories.length} story`);

    // 3. Link público da arte: assinado e temporário.
    const link = new URL(urlPublicaDaArte(feed[0].id));
    const abrir = (u: URL) => artePublica(new Request(u), { params: Promise.resolve({ id: u.pathname.split("/").pop() as string }) });
    const ok = await abrir(link);
    checar(ok.status === 200 && ok.headers.get("content-type") === "image/jpeg", "link assinado entrega o JPEG da arte");
    const adulterado = new URL(link);
    adulterado.searchParams.set("sig", "x".repeat(32));
    checar((await abrir(adulterado)).status === 404, "assinatura errada: 404");
    const vencido = new URL(link);
    vencido.searchParams.set("exp", String(Math.floor(Date.now() / 1000) - 10));
    checar((await abrir(vencido)).status === 404, "link vencido: 404");
    const outraArte = new URL(link.href.replace(feed[0].id, feed[1].id));
    checar((await abrir(outraArte)).status === 404, "a assinatura de uma arte não abre outra");

    // 4. Publicar com o Facebook falhando: Instagram sai, post fica em ERRO.
    cenario.falharFeedDaPagina = true;
    checar(await reivindicarParaPublicar(post.id, ["APROVADO", "AGENDADO", "ERRO"]), "publicar agora: o post aprovado passa pra PUBLICANDO");
    checar(!(await reivindicarParaPublicar(post.id, ["APROVADO", "AGENDADO", "ERRO"])), "um segundo clique não publica de novo (trava)");
    const t0 = Date.now();
    const p1 = await publicarPostagem(post.id);
    console.log(`     (publicação simulada: ${Date.now() - t0} ms)`);
    let estado = await prisma.postagem.findUniqueOrThrow({ where: { id: post.id } });
    let feito = estado.publicacao as PublicacaoMeta | null;
    checar(!p1.ok && estado.status === "ERRO" && /Facebook/.test(estado.erroPublicacao ?? ""), "Facebook falhou: post em ERRO, com o motivo");
    checar(feito?.instagram?.feedId && feito.instagram.feedLink?.startsWith("https://www.instagram.com/p/") && feito.instagram.storyIds?.length === 1 && !feito.facebook, "o que saiu (feed + story do Instagram) fica guardado");
    const filhos = midiaIG().filter((c) => c.p.is_carousel_item === "true");
    const carrossel = midiaIG().find((c) => c.p.media_type === "CAROUSEL");
    checar(filhos.length === feed.length && carrossel?.p.children?.split(",").length === feed.length && carrossel.p.caption === "Legenda de teste #LegausKids", `carrossel com as ${feed.length} artes de feed e a legenda`);
    checar(filhos.every((c) => c.p.image_url?.includes("/api/imagem/arte-publica/") && c.p.image_url.includes("sig=")), "a Meta recebe links assinados das artes");
    checar(midiaIG().filter((c) => c.p.media_type === "STORIES").length === 1, "story vai como STORIES");
    checar(chamadas.filter((c) => c.p.fields === "status_code" && c.caminho === "/cont-1").length >= 2, "espera o contêiner que ainda estava processando");
    checar(telegram.at(-1)?.includes("não terminou") && telegram.at(-1)?.includes("Tentar de novo"), "aviso no Telegram de que não terminou");

    // 5. Tentar de novo: só o Facebook é refeito.
    cenario.falharFeedDaPagina = false;
    const midiaAntes = midiaIG().length;
    await reivindicarParaPublicar(post.id, ["APROVADO", "AGENDADO", "ERRO"]);
    const p2 = await publicarPostagem(post.id);
    estado = await prisma.postagem.findUniqueOrThrow({ where: { id: post.id } });
    feito = estado.publicacao as PublicacaoMeta | null;
    checar(p2.ok && estado.status === "PUBLICADO" && estado.publicadaEm && !estado.erroPublicacao, "tentar de novo termina PUBLICADO");
    checar(midiaIG().length === midiaAntes, "o Instagram não é publicado duas vezes");
    const fb = feedPagina().at(-1);
    checar(feito?.facebook?.link?.startsWith("https://www.facebook.com/") && fb && Object.keys(fb.p).filter((k) => k.startsWith("attached_media")).length === feed.length && fb.p.message === "Legenda de teste #LegausKids", "Página do Facebook: post com as mesmas artes e a legenda");
    checar(telegram.at(-1)?.startsWith(`✅ Post #${estado.numero} publicado`) && telegram.at(-1)?.includes("facebook.com"), "aviso no Telegram com os links");

    // 6. Agendado: o relógio publica quando chega a hora; sem pages_manage_posts, o Facebook fica de fora com aviso.
    cenario.permissoes = cenario.permissoes.filter((p) => p !== "pages_manage_posts");
    await conectarMeta("EAA-curto-de-teste-0123456789", marcos.id, "PAG1");
    await prisma.postagem.update({
      where: { id: post.id },
      data: { status: "AGENDADO", agendadaPara: new Date(Date.now() + 60 * 60 * 1000), publicacao: {} as Prisma.InputJsonValue, publicadaEm: null },
    });
    const antes = await rodarRelogioDePublicacao();
    checar(antes.publicados === 0 && (await prisma.postagem.findUniqueOrThrow({ where: { id: post.id } })).status === "AGENDADO", "antes da hora o relógio não publica");
    await prisma.postagem.update({ where: { id: post.id }, data: { agendadaPara: new Date(Date.now() - 1000) } });
    const feedAntes = feedPagina().length;
    const rel = await rodarRelogioDePublicacao();
    estado = await prisma.postagem.findUniqueOrThrow({ where: { id: post.id } });
    checar(rel.publicados === 1 && estado.status === "PUBLICADO" && !estado.agendadaPara, "na hora o relógio publica o agendado");
    checar(feedPagina().length === feedAntes && /pages_manage_posts/.test(estado.erroPublicacao ?? ""), "sem a permissão do Facebook: sai só no Instagram, com a observação");

    // 7. Publicação que caiu no meio (PUBLICANDO há mais de 15 min) vira ERRO.
    await prisma.postagem.update({ where: { id: post.id }, data: { status: "PUBLICANDO", atualizadoEm: new Date(Date.now() - 20 * 60 * 1000) } });
    await rodarRelogioDePublicacao();
    estado = await prisma.postagem.findUniqueOrThrow({ where: { id: post.id } });
    checar(estado.status === "ERRO" && /interrompida/.test(estado.erroPublicacao ?? ""), "publicação travada vira ERRO pra tentar de novo");

    // 7b. Acesso revogado no meio: para na primeira recusa, uma mensagem só, e a conexão fica marcada com problema.
    cenario.acessoRevogado = true;
    await prisma.postagem.update({ where: { id: post.id }, data: { status: "APROVADO", publicacao: {} as Prisma.InputJsonValue } });
    await reivindicarParaPublicar(post.id, ["APROVADO"]);
    const chamadasAntes = chamadas.length;
    const p3 = await publicarPostagem(post.id);
    estado = await prisma.postagem.findUniqueOrThrow({ where: { id: post.id } });
    const conexaoMarcada = await prisma.conexaoMeta.findUniqueOrThrow({ where: { id: "principal" } });
    checar(!p3.ok && estado.status === "ERRO" && /reconecte/.test(estado.erroPublicacao ?? "") && !(estado.erroPublicacao ?? "").includes(" · "), "acesso revogado: ERRO com uma mensagem só, pedindo pra reconectar");
    checar(chamadas.length - chamadasAntes === 1 && /reconecte/.test(conexaoMarcada.erro ?? ""), "para na primeira recusa e marca a conexão com problema");
    cenario.acessoRevogado = false;

    // 8. Teste diário da conexão: acesso que deixou de valer avisa no Telegram uma vez.
    cenario.tokenValido = false;
    await prisma.conexaoMeta.update({ where: { id: "principal" }, data: { verificadoEm: new Date(Date.now() - 21 * 60 * 60 * 1000), erro: null } });
    const avisosAntes = telegram.length;
    const v = await rodarRelogioDePublicacao();
    const c = await prisma.conexaoMeta.findUniqueOrThrow({ where: { id: "principal" } });
    checar(v.verificou && c.erro && telegram.length === avisosAntes + 1 && telegram.at(-1)?.includes("conexão do CRM com o Instagram/Facebook caiu"), "acesso que caiu: guarda o erro e avisa no Telegram");
    await rodarRelogioDePublicacao();
    checar(telegram.length === avisosAntes + 1, "não fica repetindo o aviso a cada minuto");
  } finally {
    if (postId) await excluirPostagem(postId);
    await desconectarMeta();
    globalThis.fetch = fetchOriginal;
  }
  checar(!(await prisma.conexaoMeta.findUnique({ where: { id: "principal" } })), "desconectar apaga a conexão de teste");
  console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
