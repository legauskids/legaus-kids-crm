"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { KanbanBoard, type KanbanItemDef } from "@/components/shared/kanban/board";
import { TaskCard } from "@/app/(app)/tarefas/task-card";
import { STATUS_LABEL, type TarefaVM } from "@/app/(app)/tarefas/types";
import { colunaKanbanTarefa } from "@/lib/utils/dates";
import { moverTarefaAction } from "@/app/(app)/tarefas/actions";
import { corDoIndice } from "@/lib/utils/colors";

const COLUMNS = [
  { id: "A_FAZER", label: STATUS_LABEL.A_FAZER, cor: corDoIndice(2) },
  { id: "EM_ANDAMENTO", label: STATUS_LABEL.EM_ANDAMENTO, cor: corDoIndice(0) },
  { id: "APROVACAO", label: STATUS_LABEL.APROVACAO, cor: corDoIndice(4) },
  { id: "ATRASADA", label: STATUS_LABEL.ATRASADA, accent: "danger" as const, droppable: false },
  { id: "CONCLUIDA", label: STATUS_LABEL.CONCLUIDA, cor: corDoIndice(1) },
];

export function KanbanView({ tarefas, onEditar }: { tarefas: TarefaVM[]; onEditar?: (tarefa: TarefaVM) => void }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const items: KanbanItemDef<TarefaVM>[] = tarefas.map((t) => ({
    id: t.id,
    columnId: colunaKanbanTarefa(new Date(t.prazo), t.status),
    data: t,
  }));

  return (
    <KanbanBoard
      id="tarefas-board"
      columns={COLUMNS}
      items={items}
      renderCard={(item) => <TaskCard tarefa={item.data} onEditar={onEditar} />}
      onDrop={(itemId, toColumnId) => {
        if (toColumnId === "ATRASADA") return;
        startTransition(async () => {
          await moverTarefaAction(itemId, toColumnId as "A_FAZER" | "EM_ANDAMENTO" | "APROVACAO" | "CONCLUIDA");
          router.refresh();
        });
      }}
    />
  );
}
