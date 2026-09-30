// Leitura dos campos de categoria de compromisso vindos de qualquer
// formulário de tarefa (componente components/tarefas/campos-categoria-tarefa).

/** Valor do seletor pra "sem categoria" (o Select do Radix não aceita valor vazio). */
export const SEM_CATEGORIA = "__nenhuma__";

/** Link colado sem http(s):// ganha https:// — vazio vira null. */
export function normalizarLink(valor: string | null | undefined): string | null {
  const limpo = (valor ?? "").trim();
  if (!limpo) return null;
  return /^https?:\/\//i.test(limpo) ? limpo : `https://${limpo}`;
}

export function categoriaDoFormulario(formData: FormData): { categoriaId: string | null; link: string | null } {
  const categoria = String(formData.get("categoriaId") ?? "").trim();
  return {
    categoriaId: categoria && categoria !== SEM_CATEGORIA ? categoria : null,
    link: normalizarLink(formData.get("link") as string | null),
  };
}
