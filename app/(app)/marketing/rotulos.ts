import type { StatusPostagem } from "@prisma/client";

export const ROTULO_STATUS_POSTAGEM: Record<StatusPostagem, string> = {
  RASCUNHO: "Rascunho",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADO: "Aprovado",
  PUBLICADO: "Publicado",
  RECUSADO: "Recusado",
};

export const VARIANTE_STATUS_POSTAGEM: Record<StatusPostagem, "secondary" | "default" | "success" | "destructive"> = {
  RASCUNHO: "secondary",
  AGUARDANDO_APROVACAO: "default",
  APROVADO: "success",
  PUBLICADO: "success",
  RECUSADO: "destructive",
};
