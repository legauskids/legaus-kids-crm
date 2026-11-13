"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormularioContrato } from "@/app/(app)/contratos/formulario-contrato";
import { dadosIniciaisContratoAction } from "@/app/(app)/contratos/actions";
import { ganharComContratoAction, moverNegocioAction } from "@/app/(app)/negocios/actions";
import type { ChaveEmpresaEmissora } from "@/lib/constants/empresa";

// Marcar como Ganho (botão da tela do negócio ou arrastando no quadro): antes
// de gerar o contrato, pede os dados dele já preenchidos com o que o CRM sabe.

export type AlvoGanho = { negocioId: string; etapaGanhoId: string; empresa: ChaveEmpresaEmissora };

type Carregado = Awaited<ReturnType<typeof dadosIniciaisContratoAction>>;

export function GanhoContratoDialog({ alvo, onFechar }: { alvo: AlvoGanho | null; onFechar: () => void }) {
  const router = useRouter();
  const [carregado, setCarregado] = useState<{ alvo: AlvoGanho; resposta: Carregado } | null>(null);
  const [semContrato, startSemContrato] = useTransition();
  const resposta = carregado && carregado.alvo === alvo ? carregado.resposta : null;

  useEffect(() => {
    if (!alvo) return;
    let vivo = true;
    dadosIniciaisContratoAction(alvo.negocioId, alvo.empresa).then(
      (r) => vivo && setCarregado({ alvo, resposta: r }),
      () => vivo && setCarregado({ alvo, resposta: { error: "Não consegui carregar os dados do negócio." } }),
    );
    return () => {
      vivo = false;
    };
  }, [alvo]);

  function ganharSemContrato() {
    if (!alvo) return;
    startSemContrato(async () => {
      const r = await moverNegocioAction(alvo.negocioId, alvo.etapaGanhoId, { semContrato: true });
      if (r.error) return void toast.error(r.error);
      onFechar();
      router.refresh();
    });
  }

  const botaoSemContrato = (
    <Button type="button" variant="ghost" onClick={ganharSemContrato} disabled={semContrato}>
      {semContrato && <Loader2 className="size-4 animate-spin" />}
      Ganho sem contrato
    </Button>
  );

  return (
    <Dialog open={alvo != null} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ganho — dados do contrato</DialogTitle>
          <DialogDescription>
            Confira os dados do cliente, do produto e do pagamento. O contrato sai em rascunho: na tela seguinte dá pra mexer no texto antes de
            gerar o PDF final.
          </DialogDescription>
        </DialogHeader>

        {!resposta ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Carregando os dados do negócio...
          </p>
        ) : "error" in resposta ? (
          <p className="text-sm text-destructive">{resposta.error}</p>
        ) : !resposta.temCliente ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">Vincule um cliente ao negócio (aba Dados) antes de marcar como Ganho com contrato.</p>
            {botaoSemContrato}
          </div>
        ) : (
          <FormularioContrato
            key={`${alvo?.negocioId}-${alvo?.empresa}`}
            inicial={resposta.dados}
            origemProduto={resposta.origemProduto}
            textoBotao="Marcar Ganho e gerar o rascunho"
            extras={botaoSemContrato}
            onEnviar={async (dados) => {
              if (!alvo) return;
              const r = await ganharComContratoAction(alvo.negocioId, alvo.etapaGanhoId, dados);
              if (r.error) return r;
              onFechar();
              toast.success("Negócio ganho! Confira o rascunho do contrato.");
              if (r.contratoId) router.push(`/contratos/${r.contratoId}`);
              else router.refresh();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
