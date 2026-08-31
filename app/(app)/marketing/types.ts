export type TipoPostagem = "FEED_INSTAGRAM" | "STORY_INSTAGRAM" | "STATUS_WHATSAPP" | "FEED_FACEBOOK";
export type StatusPostagem = "RASCUNHO" | "AGUARDANDO_APROVACAO" | "APROVADO" | "PUBLICADO" | "RECUSADO";
export type LayoutVariante = "FAIXA" | "CANTO" | "LATERAL";

export const TIPO_POSTAGEM_LABEL: Record<TipoPostagem, string> = {
  FEED_INSTAGRAM: "Feed Instagram",
  FEED_FACEBOOK: "Feed Facebook",
  STORY_INSTAGRAM: "Story Instagram",
  STATUS_WHATSAPP: "Status WhatsApp",
};

export const STATUS_POSTAGEM_LABEL: Record<StatusPostagem, string> = {
  RASCUNHO: "Rascunho",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADO: "Aprovado",
  PUBLICADO: "Publicado",
  RECUSADO: "Recusado",
};

export const LAYOUT_VARIANTE_LABEL: Record<LayoutVariante, string> = {
  FAIXA: "Faixa embaixo",
  CANTO: "Canto, sem faixa",
  LATERAL: "Faixa lateral",
};

export type VarianteVM = {
  id: string;
  layout: LayoutVariante;
  escolhida: boolean;
};

export type ImagemVM = {
  id: string;
  ordem: number;
  variantes: VarianteVM[];
};

export type PostagemVM = {
  id: string;
  numero: number;
  tipo: TipoPostagem;
  status: StatusPostagem;
  legenda: string | null;
  contexto: string | null;
  headline: string | null;
  criadoEm: string;
  criadoPorNome: string;
  imagens: ImagemVM[];
};

export type ModeloPostagemVM = {
  id: string;
  titulo: string;
  tipo: TipoPostagem;
  legendaModelo: string;
};
