/** Itens do checklist montado no formulário de criação (campos "checklist" repetidos), sem vazios. */
export function itensDoChecklist(formData: FormData): string[] {
  return formData
    .getAll("checklist")
    .map((item) => String(item).trim())
    .filter(Boolean);
}
