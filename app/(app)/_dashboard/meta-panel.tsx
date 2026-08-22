"use client";

import { useState } from "react";
import { ExpandablePanel } from "@/components/shared/expandable-panel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { centavosParaReais } from "@/lib/utils/money";
import { atualizarMetaAction } from "@/app/(app)/actions";

type Meta = {
  valorAlvoCentavos: number;
  valorGanhoCentavos: number;
  porSemana: { semana: number; valorCentavos: number; qtd: number }[];
  negociosGanhos: { id: string; titulo: string; contatoNome: string; valorCentavos: number }[];
};

type EquipeItem = { id: string; nome: string; ganhosMesQtd: number; ganhosMesValorCentavos: number };

export function MetaPanel({ meta, equipe }: { meta: Meta; equipe: EquipeItem[] }) {
  const [editando, setEditando] = useState(false);
  const progresso = meta.valorAlvoCentavos > 0 ? Math.min(100, (meta.valorGanhoCentavos / meta.valorAlvoCentavos) * 100) : 0;

  const resumo = (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{centavosParaReais(meta.valorGanhoCentavos)}</span>
        <span className="text-muted-foreground">meta {centavosParaReais(meta.valorAlvoCentavos)}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progresso}%` }} />
      </div>
      {editando ? (
        <form
          action={async (formData) => {
            await atualizarMetaAction(formData);
            setEditando(false);
          }}
          className="flex items-center gap-2 pt-1"
        >
          <Input
            name="valorReais"
            type="number"
            min="0"
            step="0.01"
            defaultValue={(meta.valorAlvoCentavos / 100).toFixed(2)}
            className="h-8"
          />
          <Button type="submit" size="sm">
            Salvar
          </Button>
        </form>
      ) : (
        <button className="text-xs text-muted-foreground hover:underline" onClick={() => setEditando(true)}>
          Editar meta
        </button>
      )}
    </div>
  );

  const expandido = (
    <div className="space-y-4">
      {resumo}
      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Por semana</h4>
        <ul className="space-y-1 text-sm">
          {meta.porSemana.length === 0 && <p className="text-muted-foreground">Nenhum negócio ganho ainda este mês.</p>}
          {meta.porSemana.map((s) => (
            <li key={s.semana} className="flex justify-between">
              <span>Semana {s.semana}</span>
              <span>
                {centavosParaReais(s.valorCentavos)} ({s.qtd})
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Por responsável</h4>
        <ul className="space-y-1 text-sm">
          {equipe.map((u) => (
            <li key={u.id} className="flex justify-between">
              <span>{u.nome}</span>
              <span>
                {centavosParaReais(u.ganhosMesValorCentavos)} ({u.ganhosMesQtd})
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Negócios ganhos</h4>
        <ul className="space-y-1 text-sm">
          {meta.negociosGanhos.length === 0 && <p className="text-muted-foreground">Nenhum ainda.</p>}
          {meta.negociosGanhos.map((n) => (
            <li key={n.id} className="flex justify-between">
              <span>
                {n.titulo} — {n.contatoNome}
              </span>
              <span>{centavosParaReais(n.valorCentavos)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  return (
    <ExpandablePanel title="Meta do mês" expandedChildren={expandido}>
      {resumo}
    </ExpandablePanel>
  );
}
