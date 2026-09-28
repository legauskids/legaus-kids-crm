"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { PainelView } from "@/app/(app)/producao/painel-view";
import { CalendarioProducaoView } from "@/app/(app)/producao/calendario-view";
import { ConcluidosView } from "@/app/(app)/producao/concluidos-view";
import type { AvaliacaoVM, ConcluidoVM, EmProducaoVM, InstalacaoVM } from "@/app/(app)/producao/types";

const VIEWS = [
  { id: "painel", label: "Painel" },
  { id: "calendario", label: "Calendário" },
  { id: "concluidos", label: "Concluídos" },
] as const;

type ViewId = (typeof VIEWS)[number]["id"];

export function ProducaoShell({
  abaInicial,
  emProducao,
  instalacoes,
  emAvaliacao,
  concluidos,
}: {
  /** ?aba=calendario / concluidos — pra dar link direto pra uma aba. */
  abaInicial?: string;
  emProducao: EmProducaoVM[];
  instalacoes: InstalacaoVM[];
  emAvaliacao: AvaliacaoVM[];
  concluidos: ConcluidoVM[];
}) {
  const [view, setView] = useState<ViewId>(() => VIEWS.find((v) => v.id === abaInicial)?.id ?? "painel");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-card px-6 py-3.5 shadow-xs">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Produção &amp; Instalações</h1>
        <div className="flex gap-1.5">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                view === v.id
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {v.label}
              {v.id === "concluidos" && concluidos.length > 0 && <span className="ml-1.5 text-xs opacity-80">({concluidos.length})</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {view === "painel" && (
          <PainelView emProducao={emProducao} instalacoes={instalacoes.filter((n) => !n.concluido)} emAvaliacao={emAvaliacao} />
        )}
        {view === "calendario" && <CalendarioProducaoView emProducao={emProducao} instalacoes={instalacoes} />}
        {view === "concluidos" && <ConcluidosView concluidos={concluidos} />}
      </div>
    </div>
  );
}
