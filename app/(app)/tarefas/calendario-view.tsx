"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { corPrazoTarefa } from "@/lib/utils/dates";
import type { TarefaVM } from "@/app/(app)/tarefas/types";

const COR_DOT: Record<string, string> = {
  atrasada: "bg-destructive",
  hoje: "bg-sky-500",
  normal: "bg-muted-foreground",
};

export function CalendarioView({ tarefas }: { tarefas: TarefaVM[] }) {
  const [mesAtual, setMesAtual] = useState(() => new Date());

  const dias = useMemo(() => {
    const inicio = startOfWeek(startOfMonth(mesAtual), { weekStartsOn: 0 });
    const fim = endOfWeek(endOfMonth(mesAtual), { weekStartsOn: 0 });
    return eachDayOfInterval({ start: inicio, end: fim });
  }, [mesAtual]);

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium capitalize">{format(mesAtual, "MMMM yyyy", { locale: ptBR })}</h2>
        <div className="flex gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => setMesAtual((m) => subMonths(m, 1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMesAtual(new Date())}>
            Hoje
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => setMesAtual((m) => addMonths(m, 1))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-border text-xs">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
          <div key={d} className="bg-muted/40 p-1.5 text-center font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {dias.map((dia) => {
          const tarefasDoDia = tarefas.filter((t) => isSameDay(new Date(t.prazo), dia));
          return (
            <div
              key={dia.toISOString()}
              className={cn(
                "min-h-24 space-y-1 bg-background p-1.5",
                !isSameMonth(dia, mesAtual) && "bg-muted/20 text-muted-foreground",
              )}
            >
              <span className={cn("text-[11px]", isToday(dia) && "font-bold text-primary")}>{format(dia, "d")}</span>
              <ul className="space-y-0.5">
                {tarefasDoDia.map((t) => (
                  <li key={t.id} className="flex items-center gap-1 truncate" title={t.titulo}>
                    <span className={cn("size-1.5 shrink-0 rounded-full", COR_DOT[corPrazoTarefa(new Date(t.prazo), t.status)])} />
                    <span className="truncate">{t.titulo}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
