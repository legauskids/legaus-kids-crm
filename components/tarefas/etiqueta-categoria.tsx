"use client";

import { cn } from "@/lib/utils";
import { useCategoriaTarefa } from "@/components/tarefas/categorias-context";

/** Etiqueta colorida da categoria de compromisso da tarefa (nada se a tarefa não tem categoria). */
export function EtiquetaCategoria({ categoriaId, className }: { categoriaId: string | null | undefined; className?: string }) {
  const categoria = useCategoriaTarefa(categoriaId);
  if (!categoria) return null;
  return (
    <span
      className={cn("inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-tight", className)}
      style={{ color: categoria.cor, borderColor: `${categoria.cor}55`, backgroundColor: `${categoria.cor}14` }}
      title={`Compromisso: ${categoria.nome}`}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: categoria.cor }} />
      {categoria.nome}
    </span>
  );
}
