"use client";

import { TaskCard } from "@/app/(app)/tarefas/task-card";
import type { TarefaVM } from "@/app/(app)/tarefas/types";

export function ListaView({ tarefas, onEditar }: { tarefas: TarefaVM[]; onEditar?: (tarefa: TarefaVM) => void }) {
  const ordenadas = [...tarefas].sort((a, b) => new Date(a.prazo).getTime() - new Date(b.prazo).getTime());

  if (ordenadas.length === 0) {
    return <p className="p-6 text-sm text-muted-foreground">Nenhuma tarefa encontrada com os filtros atuais.</p>;
  }

  return (
    <ul className="space-y-2 p-4">
      {ordenadas.map((tarefa) => (
        <li key={tarefa.id}>
          <TaskCard tarefa={tarefa} showStatusBadge onEditar={onEditar} />
        </li>
      ))}
    </ul>
  );
}
