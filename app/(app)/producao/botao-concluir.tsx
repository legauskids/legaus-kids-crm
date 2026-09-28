"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { concluirNegocioAction, reabrirNegocioConcluidoAction } from "@/app/(app)/negocios/actions";

/**
 * Encaminha o negócio pra etapa "Concluído" do pós-venda (aba Concluídos).
 * Fora da Avaliação pede confirmação, porque pula as etapas que faltam.
 */
export function BotaoConcluir({ negocioId, titulo, etapaNome }: { negocioId: string; titulo: string; etapaNome: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function concluir() {
    if (etapaNome !== "Avaliação" && !confirm(`"${titulo}" ainda está em ${etapaNome} (sem passar pela Avaliação). Concluir mesmo assim?`)) return;
    startTransition(async () => {
      const r = await concluirNegocioAction(negocioId);
      if (r.error) return void toast.error(r.error);
      toast.success(`"${titulo}" foi para Concluídos.`);
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant="outline" className="h-7 border-success/40 px-2 text-xs text-success hover:bg-success/10 hover:text-success" onClick={concluir} disabled={pending}>
      <CheckCircle2 className="size-3.5" />
      {pending ? "Concluindo..." : "Concluído"}
    </Button>
  );
}

/** Volta um concluído pra Avaliação (sem recriar a tarefa automática da etapa). */
export function BotaoReabrir({ negocioId, titulo }: { negocioId: string; titulo: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function reabrir() {
    if (!confirm(`Reabrir "${titulo}"? Ele volta para a Avaliação.`)) return;
    startTransition(async () => {
      const r = await reabrirNegocioConcluidoAction(negocioId);
      if (r.error) return void toast.error(r.error);
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={reabrir} disabled={pending}>
      <RotateCcw className="size-3.5" />
      Reabrir
    </Button>
  );
}
