"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { initials } from "@/lib/utils";
import type { ConversaListItem } from "@/app/(app)/atendimento/types";

const TODOS_SETORES = "__todos__";

export function ConversationList({
  conversas,
  escopo,
  setorFiltroId,
  setores,
  conversaSelecionadaId,
}: {
  conversas: ConversaListItem[];
  escopo: "minhas" | "fila" | "todas";
  setorFiltroId: string | null;
  setores: { id: string; nome: string }[];
  conversaSelecionadaId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== TODOS_SETORES) params.set(key, value);
    else params.delete(key);
    router.push(`/atendimento?${params.toString()}`);
  }

  function selecionar(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("conversaId", id);
    router.push(`/atendimento?${params.toString()}`);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b p-3">
        <div className="flex gap-1">
          {(["minhas", "fila", "todas"] as const).map((e) => (
            <button
              key={e}
              onClick={() => updateParam("escopo", e)}
              className={cn(
                "flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold capitalize transition-all",
                escopo === e
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {e}
            </button>
          ))}
        </div>
        <Select value={setorFiltroId ?? TODOS_SETORES} onValueChange={(v) => updateParam("setor", v)}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="Todos os setores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS_SETORES}>Todos os setores</SelectItem>
            {setores.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ul className="flex-1 overflow-y-auto">
        {conversas.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">Nenhuma conversa encontrada.</p>
        )}
        {conversas.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => selecionar(c.id)}
              className={cn(
                "flex w-full items-start gap-2.5 border-b border-l-2 border-l-transparent p-3 text-left transition-colors hover:bg-accent/60",
                c.id === conversaSelecionadaId && "border-l-primary bg-accent",
              )}
            >
              <Avatar className="size-9 shrink-0">
                <AvatarFallback className="bg-primary/10 font-semibold text-primary">{initials(c.contatoNome)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{c.contatoNome}</p>
                  {c.status === "FILA" ? (
                    <Badge variant="secondary" className="shrink-0">
                      Fila
                    </Badge>
                  ) : (
                    <span className="shrink-0 text-[11px] text-muted-foreground">{c.atendenteNome}</span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">{c.setorNome}</p>
                {c.ultimaMensagem && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.ultimaMensagem}</p>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
