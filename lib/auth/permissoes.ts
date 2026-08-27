export const MODULOS = ["atendimento", "negocios", "tarefas", "producao", "extensao"] as const;
export type ModuloKey = (typeof MODULOS)[number];

export const MODULO_LABEL: Record<ModuloKey, string> = {
  atendimento: "Atendimento",
  negocios: "Negócios",
  tarefas: "Tarefas",
  producao: "Produção",
  extensao: "Extensão",
};

export type Permissoes = Partial<Record<ModuloKey, boolean>>;

// Chave ausente = módulo liberado (ver comentário no schema.prisma).
export function moduloPermitido(
  user: { isAdmin: boolean; permissoes: unknown },
  modulo: ModuloKey,
): boolean {
  if (user.isAdmin) return true;
  const permissoes = (user.permissoes ?? {}) as Permissoes;
  return permissoes[modulo] !== false;
}
