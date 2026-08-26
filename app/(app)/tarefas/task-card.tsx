"use client";

import { useRef, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, ThumbsUp, Pencil } from "lucide-react";
import { corPrazoTarefa } from "@/lib/utils/dates";
import { moverTarefaAction, aprovarTarefaAction, atualizarPrazoTarefaAction } from "@/app/(app)/tarefas/actions";
import { STATUS_LABEL, type TarefaVM } from "@/app/(app)/tarefas/types";

const COR_CLASSES: Record<string, string> = {
  atrasada: "border-destructive/60 bg-destructive/5",
  hoje: "border-sky-400/60 bg-sky-50 dark:bg-sky-950/30",
  normal: "border-border bg-card",
};

export function TaskCard({
  tarefa,
  showStatusBadge = false,
  onEditar,
}: {
  tarefa: TarefaVM;
  showStatusBadge?: boolean;
  onEditar?: (tarefa: TarefaVM) => void;
}) {
  const [pending, startTransition] = useTransition();
  const cor = corPrazoTarefa(new Date(tarefa.prazo), tarefa.status);
  const dataRef = useRef<HTMLInputElement>(null);
  const horaRef = useRef<HTMLInputElement>(null);

  // Um <input type="datetime-local"> só (usado antes) perdia a hora ao
  // editar: o navegador trata data e hora como "segmentos" do mesmo campo,
  // e digitar só a hora podia disparar blur com o valor ainda incompleto,
  // então o hora acabava não sendo salva. Dois campos separados (date +
  // time) são bem mais confiáveis, principalmente no celular.
  function salvarPrazo() {
    const data = dataRef.current?.value;
    const hora = horaRef.current?.value;
    if (!data || !hora) return;
    startTransition(() => atualizarPrazoTarefaAction(tarefa.id, `${data}T${hora}`));
  }

  return (
    <div className={cn("space-y-1.5 rounded-lg border p-3 text-sm shadow-sm transition-shadow hover:shadow-md", COR_CLASSES[cor])}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium leading-snug">{tarefa.titulo}</p>
        <div className="flex shrink-0 items-center gap-1">
          {tarefa.automatica && <Badge variant="secondary">auto</Badge>}
          {onEditar && (
            <button
              type="button"
              title="Editar tarefa"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onEditar(tarefa);
              }}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {tarefa.negocioTitulo && (
        <Link
          href={`/negocios/${tarefa.negocioId}`}
          className="block text-xs text-muted-foreground hover:underline"
        >
          {tarefa.negocioTitulo}
        </Link>
      )}

      {tarefa.descricao && <p className="text-xs text-muted-foreground">{tarefa.descricao}</p>}

      <div className="flex items-center justify-between gap-1 pt-1 text-xs text-muted-foreground">
        <span>{tarefa.responsavelNome}</span>
        <div className="flex items-center gap-0.5">
          <input
            ref={dataRef}
            type="date"
            // key força os inputs (não controlados) a refletirem o prazo do
            // servidor se ele mudar por fora (ex. editado pelo diálogo completo).
            key={`d-${tarefa.prazo}`}
            defaultValue={format(new Date(tarefa.prazo), "yyyy-MM-dd")}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onBlur={salvarPrazo}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            disabled={pending}
            className={cn(
              "rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-[11px] tabular-nums transition-colors hover:border-border focus:border-primary focus:bg-background focus:outline-none",
              cor === "atrasada" && "font-semibold text-destructive",
            )}
          />
          <input
            ref={horaRef}
            type="time"
            key={`h-${tarefa.prazo}`}
            defaultValue={format(new Date(tarefa.prazo), "HH:mm")}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onBlur={salvarPrazo}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            disabled={pending}
            className={cn(
              "rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-[11px] tabular-nums transition-colors hover:border-border focus:border-primary focus:bg-background focus:outline-none",
              cor === "atrasada" && "font-semibold text-destructive",
            )}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        {showStatusBadge && <Badge variant="outline">{STATUS_LABEL[tarefa.status]}</Badge>}
        {tarefa.status === "APROVACAO" && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => startTransition(() => aprovarTarefaAction(tarefa.id))}
          >
            <ThumbsUp className="size-3.5" />
            Aprovar
          </Button>
        )}
        {tarefa.status !== "CONCLUIDA" && tarefa.status !== "APROVACAO" && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => startTransition(() => moverTarefaAction(tarefa.id, "CONCLUIDA"))}
          >
            <Check className="size-3.5" />
            Concluir
          </Button>
        )}
      </div>
    </div>
  );
}
