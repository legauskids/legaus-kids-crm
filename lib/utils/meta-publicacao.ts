// Publicação dos posts pela API da Meta (etapa 3, aprovada em 2026-10-21).
// Regras puras e testáveis: permissões, escolha da Página, o que ainda falta
// publicar (o "tentar de novo" só refaz o que falhou) e o estado final.

export const PERMISSOES_INSTAGRAM = ["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement"] as const;
export const PERMISSAO_FACEBOOK = "pages_manage_posts";

/** O que já saiu em cada rede (Postagem.publicacao). */
export type PublicacaoMeta = {
  instagram?: { feedId?: string; feedLink?: string; storyIds?: string[] };
  facebook?: { postId?: string; link?: string };
};

export type PaginaMeta = { id: string; nome: string; instagramId: string | null; instagramUsuario: string | null };

/**
 * Qual Página usar: a pedida; senão a única com Instagram ligado; senão a
 * única de todas. Com mais de uma candidata, quem conecta escolhe.
 */
export function escolherPagina(paginas: PaginaMeta[], paginaId?: string | null): { pagina: PaginaMeta } | { escolher: PaginaMeta[] } | { erro: string } {
  if (paginas.length === 0) return { erro: "Esse acesso não enxerga nenhuma Página — na hora de gerar, marque a Página da Legaus." };
  if (paginaId) {
    const pedida = paginas.find((p) => p.id === paginaId);
    return pedida ? { pagina: pedida } : { erro: "A Página escolhida não está nesse acesso." };
  }
  const comInstagram = paginas.filter((p) => p.instagramId);
  if (comInstagram.length === 1) return { pagina: comInstagram[0] };
  if (paginas.length === 1) return { pagina: paginas[0] };
  return { escolher: comInstagram.length ? comInstagram : paginas };
}

export function faltandoPermissoes(concedidas: string[], comFacebook: boolean): string[] {
  const precisa: string[] = [...PERMISSOES_INSTAGRAM, ...(comFacebook ? [PERMISSAO_FACEBOOK] : [])];
  return precisa.filter((p) => !concedidas.includes(p));
}

export type PartesDoPost = { feed: number; story: number };
export type Destinos = { instagram: boolean; facebook: boolean };

/** O que ainda falta publicar, olhando o que já saiu. */
export function partesPendentes(partes: PartesDoPost, destinos: Destinos, feito: PublicacaoMeta | null | undefined) {
  return {
    instagramFeed: destinos.instagram && partes.feed > 0 && !feito?.instagram?.feedId,
    instagramStory: destinos.instagram && partes.story > 0 && (feito?.instagram?.storyIds?.length ?? 0) < partes.story,
    facebook: destinos.facebook && partes.feed > 0 && !feito?.facebook?.postId,
  };
}

export function nadaPendente(p: ReturnType<typeof partesPendentes>): boolean {
  return !p.instagramFeed && !p.instagramStory && !p.facebook;
}

/** Carrossel do Instagram e post de várias fotos: no máximo 10 imagens. */
export const MAX_IMAGENS_CARROSSEL = 10;

/** Mensagem de erro da Meta mais legível pro Marcos. */
export function erroMetaLegivel(e: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string } | null | undefined, padrao: string): string {
  if (!e) return padrao;
  if (e.code === 190) return "O acesso à Meta expirou ou foi revogado (troca de senha, app removido) — reconecte em Configurações → Instagram e Facebook.";
  if (e.code === 10 || e.code === 200) return `A Meta negou a permissão: ${e.error_user_msg || e.message || "sem detalhe"}. Confira as permissões do app e reconecte.`;
  if (e.code === 4 || e.code === 17 || e.code === 32 || e.code === 613) return "A Meta pediu pra esperar (limite de chamadas). Tente de novo em alguns minutos.";
  return e.error_user_msg || e.message || padrao;
}
