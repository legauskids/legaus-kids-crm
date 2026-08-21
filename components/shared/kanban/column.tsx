"use client";

import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { KanbanCard } from "@/components/shared/kanban/card";
import type { KanbanColumnDef, KanbanItemDef } from "@/components/shared/kanban/board";

export function KanbanColumnComponent<T>({
  column,
  items,
  renderCard,
}: {
  column: KanbanColumnDef;
  items: KanbanItemDef<T>[];
  renderCard: (item: KanbanItemDef<T>) => ReactNode;
}) {
  const droppable = column.droppable !== false;
  const { setNodeRef, isOver } = useDroppable({ id: column.id, disabled: !droppable });

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30">
      <div
        className={cn(
          "flex items-center justify-between border-b px-3 py-2",
          column.accent === "danger" && "text-destructive",
        )}
      >
        <span className="text-sm font-medium">{column.label}</span>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "min-h-24 flex-1 space-y-2 overflow-y-auto p-2 transition-colors",
          isOver && droppable && "bg-primary/10 ring-2 ring-inset ring-primary/40",
        )}
      >
        {items.map((item) => (
          <KanbanCard key={item.id} id={item.id}>
            {renderCard(item)}
          </KanbanCard>
        ))}
      </div>
    </div>
  );
}
