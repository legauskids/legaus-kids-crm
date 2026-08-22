"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import {
  criarRespostaRapidaAction,
  excluirRespostaRapidaAction,
} from "@/app/(app)/atendimento/actions";
import type { RespostaRapidaVM } from "@/app/(app)/atendimento/types";

export function QuickRepliesPopover({
  respostas,
  onSelect,
  children,
}: {
  respostas: RespostaRapidaVM[];
  onSelect: (texto: string) => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [criando, setCriando] = useState(false);
  const [pending, startTransition] = useTransition();

  const filtradas = respostas.filter(
    (r) => r.titulo.toLowerCase().includes(busca.toLowerCase()) || r.texto.toLowerCase().includes(busca.toLowerCase()),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b p-2">
          <Input placeholder="Buscar resposta rápida..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>

        <ul className="max-h-64 overflow-y-auto">
          {filtradas.length === 0 && (
            <li className="p-4 text-center text-sm text-muted-foreground">Nenhuma resposta encontrada.</li>
          )}
          {filtradas.map((r) => (
            <li key={r.id} className="group flex items-start gap-2 border-b px-3 py-2 last:border-0 hover:bg-muted/50">
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  onSelect(r.texto);
                  setOpen(false);
                }}
              >
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{r.titulo}</p>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {r.escopo === "COMPARTILHADA" ? "compartilhada" : "pessoal"}
                  </Badge>
                </div>
                <p className="truncate text-xs text-muted-foreground">{r.texto}</p>
              </button>
              <button
                className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                onClick={() =>
                  startTransition(async () => {
                    await excluirRespostaRapidaAction(r.id);
                    router.refresh();
                  })
                }
                title="Excluir"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>

        <div className="border-t p-2">
          {criando ? (
            <form
              action={(formData) =>
                startTransition(async () => {
                  await criarRespostaRapidaAction(formData);
                  setCriando(false);
                  router.refresh();
                })
              }
              className="space-y-2"
            >
              <Input name="titulo" placeholder="Título" required />
              <Textarea name="texto" placeholder="Texto da resposta" required className="min-h-16" />
              <div className="flex items-center gap-2">
                <select name="escopo" className="h-8 flex-1 rounded-md border bg-background px-2 text-xs">
                  <option value="COMPARTILHADA">Compartilhada</option>
                  <option value="PESSOAL">Pessoal</option>
                </select>
                <Button type="submit" size="sm" disabled={pending}>
                  Salvar
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setCriando(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="ghost" size="sm" className="w-full" onClick={() => setCriando(true)}>
              <Plus className="size-3.5" />
              Nova resposta
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
