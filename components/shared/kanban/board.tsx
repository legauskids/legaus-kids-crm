"use client";

import { useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumnComponent } from "@/components/shared/kanban/column";

export type KanbanColumnDef = {
  id: string;
  label: ReactNode;
  accent?: "default" | "danger";
  droppable?: boolean; // default true
};

export type KanbanItemDef<T> = {
  id: string;
  columnId: string;
  data: T;
};

export function KanbanBoard<T>({
  id,
  columns,
  items,
  renderCard,
  onDrop,
}: {
  id: string;
  columns: KanbanColumnDef[];
  items: KanbanItemDef<T>[];
  renderCard: (item: KanbanItemDef<T>, dragging?: boolean) => ReactNode;
  onDrop: (itemId: string, toColumnId: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const activeItem = items.find((i) => i.id === activeId);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const toColumnId = String(over.id);
    const item = items.find((i) => i.id === String(active.id));
    if (!item || item.columnId === toColumnId) return;
    onDrop(item.id, toColumnId);
  }

  return (
    <DndContext
      id={id}
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex h-full gap-3 overflow-x-auto p-4">
        {columns.map((column) => (
          <KanbanColumnComponent
            key={column.id}
            column={column}
            items={items.filter((i) => i.columnId === column.id)}
            renderCard={renderCard}
          />
        ))}
      </div>
      <DragOverlay>
        {activeItem ? <div className="rotate-2">{renderCard(activeItem, true)}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}
