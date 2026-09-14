"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, XCircle, CreditCard, Trash2 } from "lucide-react";
import {
  moverNegocioAction,
  marcarPagamentoIdentificadoAction,
  marcarPerdidoAction,
  excluirNegocioAction,
} from "@/app/(app)/negocios/actions";
import { MotivoPerdaDialog } from "@/app/(app)/negocios/motivo-perda-dialog";
import { ExcluirNegocioDialog } from "@/app/(app)/negocios/excluir-negocio-dialog";
import { CompletarDadosContratoDialog, type ContatoParaContrato } from "@/app/(app)/negocios/[negocioId]/completar-dados-contrato-dialog";

type Etapa = { id: string; nome: string; ordem: number; tipo: "NORMAL" | "GANHO" | "PERDIDO" };

export function EtapaBreadcrumb({
  negocioId,
  etapaAtualId,
  etapas,
  isFunilVenda,
  isFunilPosVenda,
  contato,
  formaPagamentoAtual,
}: {
  negocioId: string;
  etapaAtualId: string;
  etapas: Etapa[];
  isFunilVenda: boolean;
  isFunilPosVenda: boolean;
  contato: ContatoParaContrato | null;
  formaPagamentoAtual: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [motivoOpen, setMotivoOpen] = useState(false);
  const [excluirOpen, setExcluirOpen] = useState(false);
  const [dadosContratoAviso, setDadosContratoAviso] = useState<string | null>(null);

  const etapasNormais = [...etapas].filter((e) => e.tipo === "NORMAL").sort((a, b) => a.ordem - b.ordem);
  const etapaAtual = etapas.find((e) => e.id === etapaAtualId);
  const etapaGanho = etapas.find((e) => e.tipo === "GANHO");
  const etapaPagamento = etapas.find((e) => e.nome === "Pagamento");

  // Sem isso, um erro de moverNegocioAction (ex: falta CNPJ/representante
  // legal/forma de pagamento pro contrato, checado em validarDadosParaContrato)
  // era descartado em silêncio — o clique em "Ganho" simplesmente não fazia
  // nada visível, sem dizer o motivo nem deixar preencher o que faltava.
  function mover(etapaId: string) {
    startTransition(async () => {
      const resultado = await moverNegocioAction(negocioId, etapaId);
      if (resultado.error) {
        // Mover pra etapa Ganho só falha por causa dos dados do contrato
        // faltando (é a única checagem que moverNegocio faz nesse caso) —
        // abre o diálogo pra completar em vez de só avisar que faltou algo.
        if (etapaId === etapaGanho?.id && contato) {
          setDadosContratoAviso(resultado.error);
          return;
        }
        toast.error(resultado.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-1 text-sm">
        {etapaAtual && etapaAtual.tipo !== "NORMAL" ? (
          <Badge variant={etapaAtual.tipo === "GANHO" ? "success" : "destructive"}>{etapaAtual.nome}</Badge>
        ) : (
          etapasNormais.map((etapa, idx) => (
            <span key={etapa.id} className="flex items-center gap-1">
              {idx > 0 && <span className="text-muted-foreground">/</span>}
              <button
                onClick={() => mover(etapa.id)}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 font-medium transition-all",
                  etapa.id === etapaAtualId
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
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
            <Button
              size="sm"
              className="bg-success text-success-foreground shadow-sm shadow-success/20 hover:bg-success/90"
              onClick={() => etapaGanho && mover(etapaGanho.id)}
            >
              <Trophy className="size-4" />
              Ganho
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setExcluirOpen(true)}
        >
          <Trash2 className="size-4" />
          Excluir
        </Button>
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
      <ExcluirNegocioDialog
        open={excluirOpen}
        onOpenChange={setExcluirOpen}
        onConfirm={async (motivo) => {
          await excluirNegocioAction(negocioId, motivo);
          setExcluirOpen(false);
          router.push("/negocios");
        }}
      />
      {contato && etapaGanho && (
        <CompletarDadosContratoDialog
          open={dadosContratoAviso != null}
          onOpenChange={(open) => !open && setDadosContratoAviso(null)}
          negocioId={negocioId}
          etapaGanhoId={etapaGanho.id}
          contato={contato}
          formaPagamentoAtual={formaPagamentoAtual}
          avisoInicial={dadosContratoAviso}
        />
      )}
    </div>
  );
}
