"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
import type { EmProducaoVM, InstalacaoVM } from "@/app/(app)/producao/types";

type Evento = { id: string; titulo: string; icone: string; data: Date };

export function CalendarioProducaoView({
  emProducao,
  instalacoes,
}: {
  emProducao: EmProducaoVM[];
  instalacoes: InstalacaoVM[];
}) {
  const [mesAtual, setMesAtual] = useState(() => new Date());

  const eventos: Evento[] = useMemo(() => {
    const producaoEventos = emProducao
      .filter((n) => n.previsaoProducao)
      .map((n) => ({ id: n.id, titulo: n.titulo, icone: "🔧", data: new Date(n.previsaoProducao!) }));
    const instalacaoEventos = instalacoes.map((n) => ({
      id: n.id,
      titulo: n.titulo,
      icone: "🚚",
      data: new Date(n.dataInstalacao),
    }));
    return [...producaoEventos, ...instalacaoEventos];
  }, [emProducao, instalacoes]);

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
          const eventosDoDia = eventos.filter((e) => isSameDay(e.data, dia));
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
                {eventosDoDia.map((e) => (
                  <li key={`${e.icone}-${e.id}`} className="truncate" title={e.titulo}>
                    <Link href={`/negocios/${e.id}`} className="hover:underline">
                      {e.icone} {e.titulo}
                    </Link>
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
