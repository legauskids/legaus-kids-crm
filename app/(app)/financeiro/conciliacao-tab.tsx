"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { centavosParaReais } from "@/lib/utils/money";
import { Upload, Check, X, Undo2 } from "lucide-react";
import {
  importarExtratoAction,
  conciliarTransacaoAction,
  ignorarTransacaoAction,
  reabrirTransacaoAction,
  type AcaoImportarExtratoState,
} from "@/app/(app)/financeiro/actions";

type StatusTransacao = "NAO_CONCILIADA" | "CONCILIADA" | "IGNORADA";

const FILTROS: { valor: StatusTransacao | "TODAS"; label: string }[] = [
  { valor: "NAO_CONCILIADA", label: "Não conciliadas" },
  { valor: "CONCILIADA", label: "Conciliadas" },
  { valor: "IGNORADA", label: "Ignoradas" },
  { valor: "TODAS", label: "Todas" },
];

export type TransacaoVM = {
  id: string;
  data: string;
  descricao: string;
  valorCentavos: number;
  tipo: "ENTRADA" | "SAIDA";
  status: StatusTransacao;
  negocioId: string | null;
  negocioTitulo: string | null;
  contatoNome: string | null;
};

export type ImportacaoVM = {
  id: string;
  nomeArquivo: string;
  importadoEm: string;
  importadoPorNome: string;
  quantidadeTransacoes: number;
  naoConciliadas: number;
};

export type NegocioSeletorVM = { id: string; titulo: string; valorCentavos: number; contatoNome: string | null };

const initialState: AcaoImportarExtratoState = {};

export function ConciliacaoTab({
  transacoes,
  importacoes,
  negocios,
  filtroAtual,
}: {
  transacoes: TransacaoVM[];
  importacoes: ImportacaoVM[];
  negocios: NegocioSeletorVM[];
  filtroAtual: StatusTransacao | "TODAS";
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(importarExtratoAction, initialState);
  const [, startTransition] = useTransition();

  function mudarFiltro(valor: string) {
    const params = new URLSearchParams(window.location.search);
    params.set("aba", "conciliacao");
    params.set("filtroTransacao", valor);
    router.push(`/financeiro?${params.toString()}`);
  }

  function conciliar(transacaoId: string, negocioId: string) {
    if (!negocioId) return;
    startTransition(async () => {
      await conciliarTransacaoAction(transacaoId, negocioId);
      router.refresh();
    });
  }

  function ignorar(transacaoId: string) {
    startTransition(async () => {
      await ignorarTransacaoAction(transacaoId);
      router.refresh();
    });
  }

  function reabrir(transacaoId: string) {
    startTransition(async () => {
      await reabrirTransacaoAction(transacaoId);
      router.refresh();
    });
  }

  return (
    <div className="flex-1 space-y-5 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Importar extrato (OFX)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action={formAction} className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              name="arquivo"
              accept=".ofx,.OFX"
              required
              className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
            />
            <Button type="submit" size="sm" disabled={pending}>
              <Upload className="mr-1.5 size-3.5" />
              Importar
            </Button>
          </form>
          {state.success && (
            <p className="text-xs text-success">
              {state.success.novasImportadas} transação(ões) nova(s) importada(s)
              {state.success.duplicadasIgnoradas > 0 && ` (${state.success.duplicadasIgnoradas} já existiam, ignoradas)`}.
            </p>
          )}
          {state.error && <p className="text-xs text-destructive">{state.error}</p>}

          {importacoes.length > 0 && (
            <div className="space-y-1 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">Importações anteriores</p>
              {importacoes.map((i) => (
                <div key={i.id} className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {i.nomeArquivo} — {new Date(i.importadoEm).toLocaleString("pt-BR")} por {i.importadoPorNome}
                  </span>
                  <span>
                    {i.quantidadeTransacoes} transação(ões){i.naoConciliadas > 0 && `, ${i.naoConciliadas} pendente(s)`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold">Transações</CardTitle>
          <div className="flex gap-1">
            {FILTROS.map((f) => (
              <button
                key={f.valor}
                onClick={() => mudarFiltro(f.valor)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  filtroAtual === f.valor ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {transacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma transação nesse filtro.</p>
          ) : (
            transacoes.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{t.descricao}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(t.data).toLocaleDateString("pt-BR")} ·{" "}
                    <span className={t.tipo === "ENTRADA" ? "text-success" : "text-destructive"}>
                      {t.tipo === "ENTRADA" ? "+" : "-"}
                      {centavosParaReais(t.valorCentavos)}
                    </span>
                    {t.negocioTitulo && ` · vinculada a ${t.negocioTitulo}${t.contatoNome ? ` (${t.contatoNome})` : ""}`}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {t.status === "NAO_CONCILIADA" && (
                    <>
                      <SeletorNegocio negocios={negocios} valorCentavos={t.valorCentavos} onEscolher={(negocioId) => conciliar(t.id, negocioId)} />
                      <Button variant="outline" size="icon-sm" title="Ignorar (não é lançamento do CRM)" onClick={() => ignorar(t.id)}>
                        <X className="size-3.5" />
                      </Button>
                    </>
                  )}
                  {(t.status === "CONCILIADA" || t.status === "IGNORADA") && (
                    <Button variant="outline" size="sm" onClick={() => reabrir(t.id)}>
                      <Undo2 className="mr-1 size-3.5" />
                      Reabrir
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SeletorNegocio({
  negocios,
  valorCentavos,
  onEscolher,
}: {
  negocios: NegocioSeletorVM[];
  valorCentavos: number;
  onEscolher: (negocioId: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const ordenados = [...negocios].sort((a, b) => {
    const aBate = a.valorCentavos === valorCentavos ? 0 : 1;
    const bBate = b.valorCentavos === valorCentavos ? 0 : 1;
    return aBate - bBate;
  });

  if (!aberto) {
    return (
      <Button size="sm" onClick={() => setAberto(true)}>
        <Check className="mr-1 size-3.5" />
        Vincular
      </Button>
    );
  }

  return (
    <select
      autoFocus
      defaultValue=""
      onChange={(e) => {
        if (e.target.value) onEscolher(e.target.value);
        setAberto(false);
      }}
      onBlur={() => setAberto(false)}
      className="h-8 min-w-56 rounded-md border bg-background px-2 text-xs"
    >
      <option value="">Escolha o negócio...</option>
      {ordenados.map((n) => (
        <option key={n.id} value={n.id}>
          {n.valorCentavos === valorCentavos ? "★ " : ""}
          {n.titulo}
          {n.contatoNome ? ` — ${n.contatoNome}` : ""} ({centavosParaReais(n.valorCentavos)})
        </option>
      ))}
    </select>
  );
}
