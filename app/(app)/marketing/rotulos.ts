import type { StatusPostagem } from "@prisma/client";

export const ROTULO_STATUS_POSTAGEM: Record<StatusPostagem, string> = {
  RASCUNHO: "Rascunho",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADO: "Aprovado",
  AGENDADO: "Agendado",
  PUBLICANDO: "Publicando",
  PUBLICADO: "Publicado",
  ERRO: "Erro ao publicar",
  RECUSADO: "Recusado",
};

export const VARIANTE_STATUS_POSTAGEM: Record<StatusPostagem, "secondary" | "default" | "success" | "destructive"> = {
  RASCUNHO: "secondary",
  AGUARDANDO_APROVACAO: "default",
  APROVADO: "success",
  AGENDADO: "default",
  PUBLICANDO: "default",
  PUBLICADO: "success",
  ERRO: "destructive",
  RECUSADO: "destructive",
};
