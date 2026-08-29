export const MODULOS = [
  "atendimento",
  "negocios",
  "tarefas",
  "producao",
  "contatos",
  "produtos",
  "orcamentos",
  "agente",
  "extensao",
] as const;
export type ModuloKey = (typeof MODULOS)[number];

// "contatos" virou a aba "Cadastros" (contatos + clientes + fornecedores +
// produtos) — o nome da chave ficou o mesmo pra não perder permissões já
// salvas, só o rótulo mudou.
export const MODULO_LABEL: Record<ModuloKey, string> = {
  atendimento: "Atendimento",
  negocios: "Negócios",
  tarefas: "Tarefas",
  producao: "Produção",
  contatos: "Cadastros",
  produtos: "Produtos",
  orcamentos: "Orçamentos",
  agente: "Agente",
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
