"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, XCircle, CreditCard } from "lucide-react";
import {
  moverNegocioAction,
  marcarPagamentoIdentificadoAction,
  marcarPerdidoAction,
} from "@/app/(app)/negocios/actions";
import { MotivoPerdaDialog } from "@/app/(app)/negocios/motivo-perda-dialog";

type Etapa = { id: string; nome: string; ordem: number; tipo: "NORMAL" | "GANHO" | "PERDIDO" };

export function EtapaBreadcrumb({
  negocioId,
  etapaAtualId,
  etapas,
  isFunilVenda,
  isFunilPosVenda,
}: {
  negocioId: string;
  etapaAtualId: string;
  etapas: Etapa[];
  isFunilVenda: boolean;
  isFunilPosVenda: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [motivoOpen, setMotivoOpen] = useState(false);

  const etapasNormais = [...etapas].filter((e) => e.tipo === "NORMAL").sort((a, b) => a.ordem - b.ordem);
  const etapaAtual = etapas.find((e) => e.id === etapaAtualId);
  const etapaGanho = etapas.find((e) => e.tipo === "GANHO");
  const etapaPagamento = etapas.find((e) => e.nome === "Pagamento");

  function mover(etapaId: string) {
    startTransition(async () => {
      await moverNegocioAction(negocioId, etapaId);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-1 text-sm">
        {etapaAtual && etapaAtual.tipo !== "NORMAL" ? (
          <Badge variant={etapaAtual.tipo === "GANHO" ? "default" : "destructive"}>{etapaAtual.nome}</Badge>
        ) : (
          etapasNormais.map((etapa, idx) => (
            <span key={etapa.id} className="flex items-center gap-1">
              {idx > 0 && <span className="text-muted-foreground">/</span>}
              <button
                onClick={() => mover(etapa.id)}
                className={cn(
                  "rounded px-2 py-1 transition-colors",
                  etapa.id === etapaAtualId
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {etapa.nome}
              </button>
            </span>
          ))
        )}
      </div>

      <div className="flex items-center gap-2">
        {isFunilPosVenda && etapaAtual?.nome === "Pagamento" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              startTransition(async () => {
                await marcarPagamentoIdentificadoAction(negocioId);
                router.refresh();
              })
            }
          >
            <CreditCard className="size-4" />
            Marcar pagamento identificado
          </Button>
        )}
        {isFunilVenda && etapaAtual?.tipo === "NORMAL" && (
          <>
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => setMotivoOpen(true)}>
              <XCircle className="size-4" />
              Perdido
            </Button>
            <Button size="sm" onClick={() => etapaGanho && mover(etapaGanho.id)}>
              <Trophy className="size-4" />
              Ganho
            </Button>
          </>
        )}
      </div>

      <MotivoPerdaDialog
        open={motivoOpen}
        onOpenChange={setMotivoOpen}
        onConfirm={async (motivo) => {
          await marcarPerdidoAction(negocioId, motivo);
          setMotivoOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
