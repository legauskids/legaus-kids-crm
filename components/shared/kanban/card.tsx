"use client";

import type { ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

export function KanbanCard({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab touch-none rounded-lg border bg-card shadow-sm transition-all hover:shadow-md active:cursor-grabbing",
        isDragging && "opacity-40 shadow-lg",
      )}
    >
      {children}
    </div>
  );
}
