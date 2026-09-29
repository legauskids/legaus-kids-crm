"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Checklist montado antes da tarefa existir, em todo formulário que cria
 * tarefa (Tarefas, negócio, Atendimento): cada item vira um campo
 * "checklist" do formulário e é criado junto com a tarefa (a action lê com
 * itensDoChecklist, de lib/utils/checklist.ts). O que estiver
 * digitado no campo e não foi adicionado também vai (o campo tem o mesmo
 * nome), pra ninguém perder o último item por esquecer de clicar no +.
 */
export function ChecklistNovaTarefa({ id = "checklist-novo" }: { id?: string }) {
  const [itens, setItens] = useState<string[]>([]);
  const [novo, setNovo] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function adicionar() {
    const texto = novo.trim();
    if (!texto) return;
    setItens((atual) => [...atual, texto]);
    setNovo("");
    inputRef.current?.focus();
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Checklist (opcional)</Label>
      {itens.length > 0 && (
        <ul className="space-y-1.5">
          {itens.map((item, indice) => (
            <li key={`${indice}-${item}`} className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1">
              <input type="hidden" name="checklist" value={item} />
              <span className="size-3.5 shrink-0 rounded-sm border border-input" />
              <span className="flex-1 text-sm">{item}</span>
              <button
                type="button"
                title="Remover item"
                onClick={() => setItens((atual) => atual.filter((_, i) => i !== indice))}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          id={id}
          ref={inputRef}
          name="checklist"
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              adicionar();
            }
          }}
          placeholder="Adicionar item (Enter)"
        />
        <Button type="button" variant="outline" size="icon" disabled={!novo.trim()} onClick={adicionar} aria-label="Adicionar item">
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}
