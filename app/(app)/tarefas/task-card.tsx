"use client";

import { useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, ThumbsUp } from "lucide-react";
import { corPrazoTarefa } from "@/lib/utils/dates";
import { moverTarefaAction, aprovarTarefaAction } from "@/app/(app)/tarefas/actions";
import { STATUS_LABEL, type TarefaVM } from "@/app/(app)/tarefas/types";

const COR_CLASSES: Record<string, string> = {
  atrasada: "border-destructive/60 bg-destructive/5",
  hoje: "border-sky-400/60 bg-sky-50 dark:bg-sky-950/30",
  normal: "border-border bg-card",
};

export function TaskCard({
  tarefa,
  showStatusBadge = false,
}: {
  tarefa: TarefaVM;
  showStatusBadge?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const cor = corPrazoTarefa(new Date(tarefa.prazo), tarefa.status);
  const prazoFormatado = new Date(tarefa.prazo).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={cn("space-y-1.5 rounded-lg border p-3 text-sm shadow-sm transition-shadow hover:shadow-md", COR_CLASSES[cor])}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium leading-snug">{tarefa.titulo}</p>
        {tarefa.automatica && (
          <Badge variant="secondary" className="shrink-0">
            auto
          </Badge>
        )}
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

      <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
        <span>{tarefa.responsavelNome}</span>
        <span className={cn(cor === "atrasada" && "font-medium text-destructive")}>{prazoFormatado}</span>
      </div>

      <div className="flex items-center gap-2 pt-1">
        {showStatusBadge && <Badge variant="outline">{STATUS_LABEL[tarefa.status]}</Badge>}
        {tarefa.status === "APROVACAO" && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
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
