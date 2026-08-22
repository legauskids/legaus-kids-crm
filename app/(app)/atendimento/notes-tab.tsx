"use client";

import { useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { criarNotaAction } from "@/app/(app)/atendimento/actions";
import type { NotaVM } from "@/app/(app)/atendimento/types";

export function NotesTab({ conversaId, notas }: { conversaId: string; notas: NotaVM[] }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {notas.length === 0 && <p className="text-center text-sm text-muted-foreground">Nenhuma nota interna ainda.</p>}
        {notas.map((n) => (
          <div key={n.id} className="rounded-md border bg-amber-50 p-3 text-sm dark:bg-amber-950/20">
            <p className="whitespace-pre-wrap">{n.texto}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {n.autorNome} · {new Date(n.criadaEm).toLocaleString("pt-BR")}
            </p>
          </div>
        ))}
      </div>
      <form
        ref={formRef}
        action={async (formData) => {
          await criarNotaAction(formData);
          formRef.current?.reset();
        }}
        className="flex items-end gap-2 border-t p-3"
      >
        <input type="hidden" name="conversaId" value={conversaId} />
        <Textarea name="texto" placeholder="Nota interna (não visível para o cliente)..." className="min-h-10 flex-1 resize-none" rows={1} required />
        <Button type="submit">Adicionar</Button>
      </form>
    </div>
  );
}
