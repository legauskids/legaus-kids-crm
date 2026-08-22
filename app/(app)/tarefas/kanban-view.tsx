"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { KanbanBoard, type KanbanItemDef } from "@/components/shared/kanban/board";
import { TaskCard } from "@/app/(app)/tarefas/task-card";
import { STATUS_LABEL, type TarefaVM } from "@/app/(app)/tarefas/types";
import { colunaKanbanTarefa } from "@/lib/utils/dates";
import { moverTarefaAction } from "@/app/(app)/tarefas/actions";

const COLUMNS = [
  { id: "A_FAZER", label: STATUS_LABEL.A_FAZER },
  { id: "EM_ANDAMENTO", label: STATUS_LABEL.EM_ANDAMENTO },
  { id: "APROVACAO", label: STATUS_LABEL.APROVACAO },
  { id: "ATRASADA", label: STATUS_LABEL.ATRASADA, accent: "danger" as const, droppable: false },
  { id: "CONCLUIDA", label: STATUS_LABEL.CONCLUIDA },
];

export function KanbanView({ tarefas }: { tarefas: TarefaVM[] }) {
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
      renderCard={(item) => <TaskCard tarefa={item.data} />}
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
