"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { PainelView } from "@/app/(app)/producao/painel-view";
import { CalendarioProducaoView } from "@/app/(app)/producao/calendario-view";
import type { EmProducaoVM, InstalacaoVM } from "@/app/(app)/producao/types";

const VIEWS = [
  { id: "painel", label: "Painel" },
  { id: "calendario", label: "Calendário" },
] as const;

export function ProducaoShell({
  emProducao,
  instalacoes,
}: {
  emProducao: EmProducaoVM[];
  instalacoes: InstalacaoVM[];
}) {
  const [view, setView] = useState<(typeof VIEWS)[number]["id"]>("painel");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <h1 className="text-xl font-semibold">Produção &amp; Instalações</h1>
        <div className="flex gap-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                view === v.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {view === "painel" ? (
          <PainelView emProducao={emProducao} instalacoes={instalacoes} />
        ) : (
          <CalendarioProducaoView emProducao={emProducao} instalacoes={instalacoes} />
        )}
      </div>
    </div>
  );
}
