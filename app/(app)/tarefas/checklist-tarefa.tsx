"use client";

import { useRef, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X } from "lucide-react";
import {
  adicionarItemChecklistAction,
  alternarItemChecklistAction,
  excluirItemChecklistAction,
} from "@/app/(app)/tarefas/actions";
import type { ItemChecklistVM } from "@/app/(app)/tarefas/types";

export function ChecklistTarefa({ tarefaId, checklist }: { tarefaId: string; checklist: ItemChecklistVM[] }) {
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const [novoTexto, setNovoTexto] = useState("");

  const total = checklist.length;
  const concluidos = checklist.filter((i) => i.concluido).length;
  const progresso = total > 0 ? Math.round((concluidos / total) * 100) : 0;

  function adicionar() {
    const texto = novoTexto.trim();
    if (!texto) return;
    setNovoTexto("");
    startTransition(async () => {
      await adicionarItemChecklistAction(tarefaId, texto);
      inputRef.current?.focus();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Checklist</Label>
        {total > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {concluidos}/{total} ({progresso}%)
          </span>
        )}
      </div>

      {total > 0 && (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", progresso === 100 ? "bg-success" : "bg-primary")}
            style={{ width: `${progresso}%` }}
          />
        </div>
      )}

      <ul className="space-y-1.5">
        {checklist.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={item.concluido}
              disabled={pending}
              onChange={() => startTransition(() => alternarItemChecklistAction(item.id))}
              className="size-4 shrink-0 accent-primary"
            />
            <span className={cn("flex-1 text-sm", item.concluido && "text-muted-foreground line-through")}>{item.texto}</span>
            <button
              type="button"
              title="Remover item"
              disabled={pending}
              onClick={() => startTransition(() => excluirItemChecklistAction(item.id))}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
        {total === 0 && <p className="text-sm text-muted-foreground">Nenhum item ainda.</p>}
      </ul>

      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={novoTexto}
          onChange={(e) => setNovoTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              adicionar();
            }
          }}
          placeholder="Adicionar item ao checklist"
          disabled={pending}
        />
        <Button type="button" variant="outline" size="icon" disabled={pending || !novoTexto.trim()} onClick={adicionar}>
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}
