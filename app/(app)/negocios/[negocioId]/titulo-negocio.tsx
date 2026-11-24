"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { renomearNegocioAction } from "@/app/(app)/negocios/actions";
import { MAX_TITULO_NEGOCIO } from "@/lib/utils/negocio-pos-venda";

/** Título no topo do negócio com o lápis para renomear ali mesmo (Enter salva, Esc cancela). Pedido de 2026-11-24. */
export function TituloNegocio({ negocioId, titulo }: { negocioId: string; titulo: string }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(titulo);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function abrir() {
    setValor(titulo);
    setErro(null);
    setAviso(null);
    setEditando(true);
  }

  function salvar() {
    if (!valor.trim()) {
      setErro("Informe um título.");
      return;
    }
    startTransition(async () => {
      const r = await renomearNegocioAction(negocioId, valor);
      if (r.error) {
        setErro(r.error);
        return;
      }
      setEditando(false);
      setAviso(r.gemeo ? `O outro negócio do mesmo projeto também mudou: “${r.gemeo}”.` : null);
    });
  }

  if (!editando) {
    return (
      <div className="min-w-0">
        <div className="flex items-start gap-1">
          <h1 className="min-w-0 break-words text-xl font-bold tracking-tight text-foreground">{titulo}</h1>
          <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground" onClick={abrir} aria-label="Editar título" title="Editar título">
            <Pencil className="size-3.5" />
          </Button>
        </div>
        {aviso && <p className="text-xs text-muted-foreground">{aviso}</p>}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <form
        className="flex min-w-0 items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
      >
        <Input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditando(false);
          }}
          autoFocus
          maxLength={MAX_TITULO_NEGOCIO}
          disabled={pending}
          aria-label="Título do negócio"
          className="h-9 min-w-0 flex-1 text-base font-semibold"
        />
        <Button type="submit" size="icon" className="size-9 shrink-0" disabled={pending} aria-label="Salvar título" title="Salvar">
          <Check className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" disabled={pending} onClick={() => setEditando(false)} aria-label="Cancelar" title="Cancelar">
          <X className="size-4" />
        </Button>
      </form>
      {erro && <p className="mt-1 text-xs text-destructive">{erro}</p>}
    </div>
  );
}
