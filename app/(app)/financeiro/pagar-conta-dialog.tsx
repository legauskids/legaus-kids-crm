"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { centavosParaReais } from "@/lib/utils/money";
import { ROTULO_ORIGEM, ROTULO_STATUS, centavosParaTexto, textoParaCentavos, type OrigemDespesa, type StatusDespesa } from "@/lib/utils/despesas";
import { dataBR, rotuloParcela, type ContaPagarVM } from "@/lib/utils/contas-pagar";
import { despesasParaLigarAction, marcarContaPagaAction } from "@/app/(app)/financeiro/contas-pagar-actions";

type DespesaParaLigar = {
  id: string;
  dia: string;
  fornecedor: string;
  origem: OrigemDespesa;
  status: StatusDespesa;
  valorCentavos: number;
  categoriaNome: string | null;
};

const NOVA = "nova";

/**
 * "Marcar como paga": cria a despesa do pagamento (aguardando o extrato) ou
 * liga a uma despesa de mesmo valor já registrada — a do push do banco, por
 * exemplo —, para o pagamento não entrar duas vezes.
 */
export function PagarContaDialog({
  conta,
  hoje,
  open,
  onOpenChange,
}: {
  conta: ContaPagarVM;
  hoje: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [dia, setDia] = useState(hoje);
  const [valorTexto, setValorTexto] = useState(centavosParaTexto(conta.valorCentavos));
  const [despesas, setDespesas] = useState<DespesaParaLigar[] | null>(null);
  const [escolha, setEscolha] = useState<string>(NOVA);
  const valorCentavos = textoParaCentavos(valorTexto);

  // Procura despesa parecida quando muda a data ou o valor; a primeira achada já vem marcada.
  useEffect(() => {
    if (!dia || Number.isNaN(valorCentavos) || valorCentavos <= 0) return;
    let cancelado = false;
    const espera = setTimeout(async () => {
      const achadas = await despesasParaLigarAction(conta.id, dia, valorCentavos).catch(() => []);
      if (cancelado) return;
      setDespesas(achadas);
      setEscolha((atual) => (achadas.some((d) => d.id === atual) ? atual : (achadas[0]?.id ?? NOVA)));
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [conta.id, dia, valorCentavos]);

  function confirmar() {
    setErro(null);
    if (escolha === NOVA && (Number.isNaN(valorCentavos) || valorCentavos <= 0)) {
      setErro("Valor inválido — use por exemplo 96 ou 1.234,56.");
      return;
    }
    startTransition(async () => {
      const r = await marcarContaPagaAction(conta.id, { dia, valorCentavos, despesaId: escolha === NOVA ? null : escolha }).catch(() => ({
        error: "Não foi possível salvar agora — confira a internet e tente de novo.",
      }));
      if (r.error) {
        setErro(r.error);
        return;
      }
      toast.success(escolha === NOVA ? "Conta paga — a despesa ficou aguardando o extrato." : "Conta paga — ligada à despesa que já existia.");
      onOpenChange(false);
      router.refresh();
    });
  }

  const parcela = rotuloParcela(conta.parcela, conta.totalParcelas);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] grid-cols-1 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Marcar como paga</DialogTitle>
          <DialogDescription>
            {conta.fornecedor}
            {parcela ? ` · parcela ${parcela}` : ""} · vence {dataBR(conta.vencimento)} · {centavosParaReais(conta.valorCentavos)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Pago em
            <Input type="date" value={dia} max={hoje} onChange={(e) => setDia(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Valor pago (R$)
            <Input value={valorTexto} onChange={(e) => setValorTexto(e.target.value)} inputMode="decimal" />
          </label>
        </div>

        <div className="grid gap-2 text-sm">
          {despesas && despesas.length > 0 && (
            <>
              <p className="text-xs font-medium text-muted-foreground">
                {despesas.length === 1 ? "Já existe uma despesa" : "Já existem despesas"} com esse valor nesses dias — é o mesmo pagamento?
              </p>
              {despesas.map((d) => (
                <Opcao key={d.id} marcada={escolha === d.id} onEscolher={() => setEscolha(d.id)}>
                  <span className="font-medium">
                    {dataBR(d.dia)} · {d.fornecedor} · {centavosParaReais(d.valorCentavos)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {[d.categoriaNome, ROTULO_ORIGEM[d.origem], ROTULO_STATUS[d.status]].filter(Boolean).join(" · ")}
                  </span>
                </Opcao>
              ))}
            </>
          )}
          <Opcao marcada={escolha === NOVA} onEscolher={() => setEscolha(NOVA)}>
            <span className="font-medium">{despesas && despesas.length > 0 ? "Não, é outro pagamento: registrar despesa nova" : "Registrar a despesa do pagamento"}</span>
            <span className="block text-xs text-muted-foreground">Fica aguardando o extrato do banco, com a categoria e o centro da conta.</span>
          </Opcao>
        </div>
        {erro && <p className="text-sm text-destructive">{erro}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={pending}>
            {pending ? "Salvando..." : "Confirmar pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Opcao({ marcada, onEscolher, children }: { marcada: boolean; onEscolher: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={marcada}
      onClick={onEscolher}
      className={cn("flex w-full items-start gap-2 rounded-md border p-2 text-left transition-colors", marcada ? "border-primary bg-primary/5" : "hover:bg-muted")}
    >
      <span className={cn("mt-1 size-3.5 shrink-0 rounded-full border-2", marcada ? "border-primary bg-primary" : "border-muted-foreground/40")} />
      <span className="min-w-0">{children}</span>
    </button>
  );
}
