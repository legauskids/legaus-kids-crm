export type TipoPostagem = "FEED_INSTAGRAM" | "STORY_INSTAGRAM" | "STATUS_WHATSAPP" | "FEED_FACEBOOK";
export type StatusPostagem = "RASCUNHO" | "AGUARDANDO_APROVACAO" | "APROVADO" | "PUBLICADO" | "RECUSADO";

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

export type PostagemVM = {
  id: string;
  numero: number;
  tipo: TipoPostagem;
  status: StatusPostagem;
  legenda: string | null;
  contexto: string | null;
  criadoEm: string;
  criadoPorNome: string;
};

export type ModeloPostagemVM = {
  id: string;
  titulo: string;
  tipo: TipoPostagem;
  legendaModelo: string;
};
