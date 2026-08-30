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
        // touch-pan-y (não touch-none): deixa o navegador rolar a coluna
        // verticalmente num toque rápido; o TouchSensor (delay-based, ver
        // board.tsx) só assume o gesto como arrasto depois de segurar
        // parado por um instante, e aí sim assume o controle do toque.
        "cursor-grab touch-pan-y rounded-lg border bg-card shadow-sm transition-all hover:shadow-md active:cursor-grabbing",
        isDragging && "opacity-40 shadow-lg",
      )}
    >
      {children}
    </div>
  );
}
