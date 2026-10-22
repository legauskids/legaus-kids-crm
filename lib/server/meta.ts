import "server-only";
import { prisma } from "@/lib/db";
import { cifrar, decifrar } from "@/lib/server/cripto";
import { erroMetaLegivel, escolherPagina, faltandoPermissoes, PERMISSAO_FACEBOOK, type PaginaMeta } from "@/lib/utils/meta-publicacao";

// Conexão do CRM com a Meta (etapa 3 dos posts, 2026-10-21): login pelo
// Facebook do Marcos (administrador da Página). O acesso colado na tela vira
// um de longa duração e, dele, sai o acesso DA PÁGINA, que não vence — os
// posts saem como Legaus Kids. O app é o "Legaus Kids CRM" (META_APP_ID /
// META_APP_SECRET, só na Vercel e no .env do servidor).

export const GRAPH = "https://graph.facebook.com/v23.0";
const FINALIDADE_TOKEN = "meta-token";

export class ErroMeta extends Error {
  constructor(
    mensagem: string,
    readonly codigo?: number,
  ) {
    super(mensagem);
  }
}

type Parametros = Record<string, string | undefined>;

/** Chamada à Graph API; erro da Meta vira mensagem legível (ver erroMetaLegivel). */
export async function graph<T>(caminho: string, parametros: Parametros, metodo: "GET" | "POST" = "GET"): Promise<T> {
  const corpo = new URLSearchParams(Object.entries(parametros).filter((p): p is [string, string] => p[1] !== undefined));
  let resposta: Response;
  try {
    resposta = await fetch(metodo === "GET" ? `${GRAPH}${caminho}?${corpo}` : `${GRAPH}${caminho}`, metodo === "GET" ? undefined : { method: "POST", body: corpo });
  } catch {
    throw new ErroMeta("Falha de rede ao falar com a Meta — tente de novo.");
  }
  const json = (await resposta.json().catch(() => null)) as ({ error?: { message?: string; code?: number; error_user_msg?: string } } & T) | null;
  if (!resposta.ok || !json || json.error) throw new ErroMeta(erroMetaLegivel(json?.error, `A Meta respondeu HTTP ${resposta.status}.`), json?.error?.code);
  return json;
}

function credenciaisDoApp() {
  const id = process.env.META_APP_ID?.trim();
  const segredo = process.env.META_APP_SECRET?.trim();
  if (!id || !segredo) throw new ErroMeta("O app da Meta não está configurado no servidor (META_APP_ID / META_APP_SECRET).");
  return { id, segredo, tokenDoApp: `${id}|${segredo}` };
}

export function metaConfigurada(): boolean {
  return Boolean(process.env.META_APP_ID?.trim() && process.env.META_APP_SECRET?.trim());
}

type ContaDaPagina = { id: string; name: string; access_token?: string; instagram_business_account?: { id: string; username?: string } };
type Escopo = { scope: string; target_ids?: string[] };

const CAMPOS_PAGINA = "id,name,access_token,instagram_business_account{id,username}";

/**
 * Páginas que o acesso enxerga (só as que devolvem o acesso delas). O normal
 * é /me/accounts; com o Login do Facebook para Empresas ele veio vazio
 * (22/10) — a Página escolhida na janela fica nos escopos detalhados do
 * acesso (target_ids) e/ou no portfólio de negócios.
 */
async function paginasDoAcesso(token: string, escopos: Escopo[]): Promise<{ contas: ContaDaPagina[]; diagnostico: string }> {
  const achadas = new Map<string, ContaDaPagina>();
  const semAcesso = new Set<string>();
  const guardar = (c: ContaDaPagina | null | undefined) => {
    if (!c?.id) return;
    if (c.access_token) achadas.set(c.id, c);
    else semAcesso.add(c.name ?? c.id);
  };
  const comuns = await graph<{ data: ContaDaPagina[] }>("/me/accounts", { fields: CAMPOS_PAGINA, limit: "100", access_token: token });
  comuns.data.forEach(guardar);
  if (achadas.size) return { contas: [...achadas.values()], diagnostico: "" };

  const ids = [...new Set(escopos.filter((e) => e.scope.startsWith("pages_")).flatMap((e) => e.target_ids ?? []))];
  for (const id of ids) guardar(await graph<ContaDaPagina>(`/${id}`, { fields: CAMPOS_PAGINA, access_token: token }).catch(() => null));
  let portfolios: { id: string }[] = [];
  if (!achadas.size) {
    portfolios = (await graph<{ data: { id: string }[] }>("/me/businesses", { fields: "id", access_token: token }).catch(() => ({ data: [] }))).data;
    for (const p of portfolios) {
      for (const aresta of ["owned_pages", "client_pages"]) {
        const r = await graph<{ data: ContaDaPagina[] }>(`/${p.id}/${aresta}`, { fields: CAMPOS_PAGINA, limit: "100", access_token: token }).catch(() => ({ data: [] }));
        r.data.forEach(guardar);
      }
    }
  }
  const diagnostico = [
    `lista comum: ${comuns.data.length}`,
    `Páginas nos escopos do acesso: ${ids.length}`,
    `portfólios de negócios: ${portfolios.length}`,
    ...(semAcesso.size ? [`sem acesso pra publicar: ${[...semAcesso].join(", ")}`] : []),
  ].join(" · ");
  return { contas: [...achadas.values()], diagnostico };
}

export type ResultadoConexao =
  | { ok: true; paginaNome: string; instagramUsuario: string | null; permissoes: string[]; faltando: string[]; naoVence: boolean }
  | { escolher: PaginaMeta[] }
  | { erro: string };

/**
 * Conecta com o acesso gerado no Explorador da Graph API (curta duração) ou
 * com o token de um usuário do sistema do Meta Business Suite (já não vence,
 * usado direto — plano B de 22/10, quando a janela de login da Meta falhou).
 * Mais de uma Página candidata: devolve a lista pra escolher e é chamada de
 * novo com paginaId (o mesmo acesso curto ainda vale por ~1 h).
 */
export async function conectarMeta(tokenCurto: string, usuarioId: string, paginaId?: string | null): Promise<ResultadoConexao> {
  const app = credenciaisDoApp();
  const curto = tokenCurto.trim();
  if (curto.length < 20) return { erro: "Cole o acesso inteiro (é um texto longo, que começa com \"EAA\")." };
  const colado = await graph<{ data: { is_valid: boolean; type?: string; granular_scopes?: Escopo[] } }>("/debug_token", { input_token: curto, access_token: app.tokenDoApp });
  if (!colado.data.is_valid) return { erro: "A Meta disse que esse acesso não é válido (ou já venceu) — gere de novo." };
  const longo =
    colado.data.type === "SYSTEM_USER"
      ? { access_token: curto }
      : await graph<{ access_token: string }>("/oauth/access_token", {
          grant_type: "fb_exchange_token",
          client_id: app.id,
          client_secret: app.segredo,
          fb_exchange_token: curto,
        });
  const [permissoes, contas] = await Promise.all([
    graph<{ data: { permission: string; status: string }[] }>("/me/permissions", { access_token: longo.access_token }),
    paginasDoAcesso(longo.access_token, colado.data.granular_scopes ?? []),
  ]);
  const concedidas = permissoes.data.filter((p) => p.status === "granted").map((p) => p.permission);
  if (!contas.contas.length) {
    console.warn(`[meta] conectar: nenhuma Página — ${contas.diagnostico} · permissões: ${concedidas.join(",")}`);
    return {
      erro: `Esse acesso não enxerga nenhuma Página com permissão pra publicar. Diagnóstico: ${contas.diagnostico}. Permissões concedidas: ${concedidas.join(", ") || "nenhuma"}.`,
    };
  }
  const paginas: PaginaMeta[] = contas.contas.map((c) => ({
    id: c.id,
    nome: c.name,
    instagramId: c.instagram_business_account?.id ?? null,
    instagramUsuario: c.instagram_business_account?.username ?? null,
  }));
  const escolha = escolherPagina(paginas, paginaId);
  if (!("pagina" in escolha)) return escolha;
  const conta = contas.contas.find((c) => c.id === escolha.pagina.id) as ContaDaPagina & { access_token: string };
  const info = await graph<{ data: { is_valid: boolean; expires_at?: number } }>("/debug_token", { input_token: conta.access_token, access_token: app.tokenDoApp });
  if (!info.data.is_valid) return { erro: "A Meta disse que o acesso da Página não é válido — gere de novo." };

  const dados = {
    paginaId: escolha.pagina.id,
    paginaNome: escolha.pagina.nome,
    paginaToken: cifrar(conta.access_token, FINALIDADE_TOKEN),
    instagramId: escolha.pagina.instagramId,
    instagramUsuario: escolha.pagina.instagramUsuario,
    permissoes: concedidas,
    conectadoPorId: usuarioId,
    conectadoEm: new Date(),
    verificadoEm: new Date(),
    erro: null,
  };
  await prisma.conexaoMeta.upsert({ where: { id: "principal" }, create: { id: "principal", ...dados }, update: dados });
  return {
    ok: true,
    paginaNome: dados.paginaNome,
    instagramUsuario: dados.instagramUsuario,
    permissoes: concedidas,
    faltando: faltandoPermissoes(concedidas, true),
    naoVence: !info.data.expires_at,
  };
}

export type ConexaoAtiva = { paginaId: string; paginaNome: string; token: string; instagramId: string | null; instagramUsuario: string | null; podeFacebook: boolean };

/** A conexão com o acesso já decifrado — só pra quem publica. */
export async function obterConexao(): Promise<ConexaoAtiva | null> {
  const c = await prisma.conexaoMeta.findUnique({ where: { id: "principal" } });
  if (!c) return null;
  return {
    paginaId: c.paginaId,
    paginaNome: c.paginaNome,
    token: decifrar(c.paginaToken, FINALIDADE_TOKEN),
    instagramId: c.instagramId,
    instagramUsuario: c.instagramUsuario,
    podeFacebook: c.permissoes.includes(PERMISSAO_FACEBOOK),
  };
}

/** Pra telas: o que está conectado, sem o acesso. */
export function resumoDaConexao() {
  return prisma.conexaoMeta.findUnique({
    where: { id: "principal" },
    select: { paginaNome: true, instagramId: true, instagramUsuario: true, permissoes: true, conectadoEm: true, verificadoEm: true, erro: true },
  });
}

/** Testa se o acesso ainda vale (e se o Instagram responde). Guarda o resultado. */
export async function verificarConexao(): Promise<{ ok: true } | { ok: false; erro: string }> {
  const conexao = await obterConexao();
  if (!conexao) return { ok: false, erro: "Não há conexão com a Meta." };
  let erro: string | null = null;
  try {
    const app = credenciaisDoApp();
    const info = await graph<{ data: { is_valid: boolean } }>("/debug_token", { input_token: conexao.token, access_token: app.tokenDoApp });
    if (!info.data.is_valid) erro = "O acesso da Página não vale mais — reconecte.";
    else if (conexao.instagramId) await graph(`/${conexao.instagramId}`, { fields: "username", access_token: conexao.token });
  } catch (e) {
    erro = e instanceof Error ? e.message : "Falha ao testar a conexão.";
  }
  await prisma.conexaoMeta.update({ where: { id: "principal" }, data: { verificadoEm: new Date(), erro } });
  return erro ? { ok: false, erro } : { ok: true };
}

export async function desconectarMeta(): Promise<void> {
  await prisma.conexaoMeta.deleteMany({ where: { id: "principal" } });
}
