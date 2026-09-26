"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { centavosParaReais } from "@/lib/utils/money";
import { Plus, Trash2 } from "lucide-react";
import { salvarRateioAction } from "@/app/(app)/financeiro/actions";

export type CentroCustoVM = { id: string; nome: string; tipo: "DESPESA" | "RECEITA" };
export type ProjetoSeletorVM = { id: string; titulo: string; valorCentavos: number; contatoNome: string | null };
export type RateioVM = {
  id: string;
  valorCentavos: number;
  negocioId: string | null;
  negocioTitulo: string | null;
  centroCustoId: string | null;
  centroCustoNome: string | null;
};

type Linha = { destino: string; valorTexto: string };

/** "1.234,56", "1234,56", "1234.56" ou "R$ 1.234,56" -> centavos (NaN se inválido). */
function textoParaCentavos(texto: string): number {
  let t = texto.replace(/R\$|\s/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const numero = Number(t);
  return t === "" || !Number.isFinite(numero) ? NaN : Math.round(numero * 100);
}

function centavosParaTexto(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Divide um lançamento do extrato entre projetos (negócios) e centros de
 * custo, com valores parciais — o que sobrar fica "a classificar". Saída
 * pode ir pra custo de projeto ou centro de DESPESA; entrada, pra receita de
 * projeto ou centro de RECEITA.
 */
export function RateioDialog({
  open,
  onOpenChange,
  transacao,
  projetos,
  centros,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transacao: { id: string; descricao: string; valorCentavos: number; tipo: "ENTRADA" | "SAIDA"; rateios: RateioVM[] };
  projetos: ProjetoSeletorVM[];
  centros: CentroCustoVM[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    transacao.rateios.length > 0
      ? transacao.rateios.map((r) => ({
          destino: r.negocioId ? `n:${r.negocioId}` : `c:${r.centroCustoId}`,
          valorTexto: centavosParaTexto(r.valorCentavos),
        }))
      : [{ destino: "", valorTexto: centavosParaTexto(transacao.valorCentavos) }],
  );

  const centrosDoTipo = centros.filter((c) => c.tipo === (transacao.tipo === "SAIDA" ? "DESPESA" : "RECEITA"));
  const valores = linhas.map((l) => textoParaCentavos(l.valorTexto));
  const somaValida = valores.reduce((s, v) => s + (Number.isNaN(v) ? 0 : v), 0);
  const restante = transacao.valorCentavos - somaValida;

  function atualizar(i: number, patch: Partial<Linha>) {
    setLinhas((atual) => atual.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function salvar() {
    setErro(null);
    const linhasValidas = linhas.filter((l) => l.destino);
    const payload = linhasValidas.map((l) => ({
      negocioId: l.destino.startsWith("n:") ? l.destino.slice(2) : null,
      centroCustoId: l.destino.startsWith("c:") ? l.destino.slice(2) : null,
      valorCentavos: textoParaCentavos(l.valorTexto),
    }));
    if (payload.some((p) => Number.isNaN(p.valorCentavos))) {
      setErro("Algum valor está inválido — use por exemplo 1.234,56.");
      return;
    }
    startTransition(async () => {
      const resultado = await salvarRateioAction(transacao.id, payload);
      if (resultado.error) {
        setErro(resultado.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dividir lançamento</DialogTitle>
          <DialogDescription>
            {transacao.descricao} ·{" "}
            <span className={transacao.tipo === "ENTRADA" ? "text-success" : "text-destructive"}>
              {transacao.tipo === "ENTRADA" ? "+" : "-"}
              {centavosParaReais(transacao.valorCentavos)}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {linhas.map((linha, i) => {
            const valor = valores[i];
            const percentual = !Number.isNaN(valor) && transacao.valorCentavos > 0 ? Math.round((valor / transacao.valorCentavos) * 100) : null;
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select
                  value={linha.destino}
                  onChange={(e) => atualizar(i, { destino: e.target.value })}
                  className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">Escolha o destino...</option>
                  <optgroup label={transacao.tipo === "SAIDA" ? "Custo de projeto" : "Receita de projeto"}>
                    {projetos.map((p) => (
                      <option key={p.id} value={`n:${p.id}`}>
                        {p.titulo}
                        {p.contatoNome ? ` — ${p.contatoNome}` : ""}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Centro de custo">
                    {centrosDoTipo.map((c) => (
                      <option key={c.id} value={`c:${c.id}`}>
                        {c.nome}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">R$</span>
                  <Input
                    value={linha.valorTexto}
                    onChange={(e) => atualizar(i, { valorTexto: e.target.value })}
                    inputMode="decimal"
                    className={cn("h-9 w-28 text-right", Number.isNaN(valor) && "border-destructive")}
                  />
                  <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{percentual !== null ? `${percentual}%` : ""}</span>
                </div>
                {restante > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    title="Somar o que falta nesta linha"
                    onClick={() => atualizar(i, { valorTexto: centavosParaTexto((Number.isNaN(valor) ? 0 : valor) + restante) })}
                  >
                    + resto
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title="Remover linha"
                  disabled={linhas.length === 1}
                  onClick={() => setLinhas((atual) => atual.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={restante <= 0}
            onClick={() => setLinhas((atual) => [...atual, { destino: "", valorTexto: centavosParaTexto(Math.max(restante, 0)) }])}
          >
            <Plus className="size-3.5" />
            Adicionar linha
          </Button>
          <span className={cn("font-medium", restante === 0 ? "text-success" : restante > 0 ? "text-warning" : "text-destructive")}>
            {restante === 0
              ? "Lançamento todo classificado"
              : restante > 0
                ? `Falta classificar ${centavosParaReais(restante)}`
                : `Passou ${centavosParaReais(-restante)} do valor`}
          </span>
        </div>
        {erro && <p className="text-sm text-destructive">{erro}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending || restante < 0}>
            {pending ? "Salvando..." : "Salvar divisão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
