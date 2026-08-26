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

  const cor = column.accent !== "danger" ? column.cor : undefined;

  return (
    <div
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border-t-4 border bg-muted/40",
        cor ? cor.borderTop : "border-t-transparent",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between border-b border-border/60 px-3 py-2.5",
          column.accent === "danger" && "text-destructive",
          cor && cor.bg,
        )}
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span
            className={cn(
              "size-1.5 rounded-full",
              column.accent === "danger" ? "bg-destructive" : cor ? cor.dot : "bg-primary",
            )}
          />
          {column.label}
        </span>
        <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground shadow-xs">
          {items.length}
        </span>
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
