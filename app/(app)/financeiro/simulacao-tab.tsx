"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centavosParaReais, reaisParaCentavos } from "@/lib/utils/money";
import { Plus, Trash2 } from "lucide-react";
import { criarSimulacaoAction, excluirSimulacaoAction } from "@/app/(app)/financeiro/actions";

type TipoSimulacao = "ENTRADA" | "SAIDA";

export type SimulacaoVM = {
  id: string;
  descricao: string;
  valorCentavos: number;
  tipo: TipoSimulacao;
  data: string | null;
};

export function SimulacaoTab({ simulacoes }: { simulacoes: SimulacaoVM[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [descricao, setDescricao] = useState("");
  const [valorReais, setValorReais] = useState("");
  const [tipo, setTipo] = useState<TipoSimulacao>("ENTRADA");
  const [data, setData] = useState("");

  const totalEntradas = simulacoes.filter((s) => s.tipo === "ENTRADA").reduce((soma, s) => soma + s.valorCentavos, 0);
  const totalSaidas = simulacoes.filter((s) => s.tipo === "SAIDA").reduce((soma, s) => soma + s.valorCentavos, 0);
  const saldo = totalEntradas - totalSaidas;

  function adicionar() {
    setErro(null);
    startTransition(async () => {
      const resultado = await criarSimulacaoAction(descricao, reaisParaCentavos(Number(valorReais) || 0), tipo, data || null);
      if (resultado.error) {
        setErro(resultado.error);
        return;
      }
      setDescricao("");
      setValorReais("");
      setData("");
      router.refresh();
    });
  }

  function remover(id: string) {
    startTransition(async () => {
      await excluirSimulacaoAction(id);
      router.refresh();
    });
  }

  return (
    <div className="flex-1 space-y-5 p-6">
      <div className="rounded-md border border-blue-300 bg-blue-50 p-2.5 text-xs text-blue-800">
        Simulação é só um exercício de &quot;e se?&quot; — não afeta nem aparece na Conciliação bancária, que só mostra movimentação real
        importada do banco.
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Entradas simuladas</p>
            <p className="text-lg font-semibold text-success">{centavosParaReais(totalEntradas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Saídas simuladas</p>
            <p className="text-lg font-semibold text-destructive">{centavosParaReais(totalSaidas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Saldo simulado</p>
            <p className={`text-lg font-semibold ${saldo >= 0 ? "text-success" : "text-destructive"}`}>{centavosParaReais(saldo)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Adicionar lançamento simulado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-5">
            <div className="sm:col-span-2 space-y-2">
              <Label>Descrição</Label>
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="ex: Venda prevista Playground X" />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoSimulacao)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                <option value="ENTRADA">Entrada</option>
                <option value="SAIDA">Saída</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="number" min="0" step="0.01" value={valorReais} onChange={(e) => setValorReais(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data prevista (opcional)</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          <Button size="sm" disabled={pending} onClick={adicionar}>
            <Plus className="mr-1 size-3.5" />
            Adicionar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Lançamentos simulados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {simulacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum lançamento simulado ainda.</p>
          ) : (
            simulacoes.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{s.descricao}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.data ? new Date(s.data).toLocaleDateString("pt-BR") : "sem data"} ·{" "}
                    <span className={s.tipo === "ENTRADA" ? "text-success" : "text-destructive"}>
                      {s.tipo === "ENTRADA" ? "+" : "-"}
                      {centavosParaReais(s.valorCentavos)}
                    </span>
                  </p>
                </div>
                <Button variant="outline" size="icon-sm" disabled={pending} onClick={() => remover(s.id)} title="Remover">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
