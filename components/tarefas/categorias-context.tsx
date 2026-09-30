"use client";

import { createContext, useContext, type ReactNode } from "react";

export type CategoriaTarefaVM = {
  id: string;
  nome: string;
  cor: string;
  campoExtra: "NENHUM" | "LINK" | "PAUTA";
  ativa: boolean;
};

// Carregado uma vez no layout do CRM (app/(app)/layout.tsx) — assim qualquer
// formulário ou cartão de tarefa (Tarefas, negócio, Atendimento, Painel) lê as
// categorias sem precisar passar a lista de componente em componente.
const CategoriasTarefaContext = createContext<CategoriaTarefaVM[]>([]);

export function CategoriasTarefaProvider({ categorias, children }: { categorias: CategoriaTarefaVM[]; children: ReactNode }) {
  return <CategoriasTarefaContext.Provider value={categorias}>{children}</CategoriasTarefaContext.Provider>;
}

/** Todas as categorias (inclusive inativas, pra etiqueta de tarefa antiga continuar aparecendo). */
export function useCategoriasTarefa(): CategoriaTarefaVM[] {
  return useContext(CategoriasTarefaContext);
}

export function useCategoriaTarefa(id: string | null | undefined): CategoriaTarefaVM | null {
  const categorias = useCategoriasTarefa();
  return id ? (categorias.find((c) => c.id === id) ?? null) : null;
}
