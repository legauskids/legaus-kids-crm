"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { centavosParaReais } from "@/lib/utils/money";
import { ROTULO_CONTA, ROTULO_ORIGEM, ROTULO_STATUS, type ContaBancaria, type FiltroDespesas, type OrigemDespesa, type StatusDespesa } from "@/lib/utils/despesas";
import { BellRing, Check, Landmark, MessageSquare, Mic, Paperclip, PenLine, Pencil, Plus, Receipt, X } from "lucide-react";
import { confirmarDespesaAction, excluirDespesaAction } from "@/app/(app)/financeiro/actions";
import {
  DespesaDialog,
  type CategoriaVM,
  type CentroGeralVM,
  type DespesaEdicaoVM,
  type ProjetoDespesaVM,
} from "@/app/(app)/financeiro/despesa-dialog";

export type DespesaVM = DespesaEdicaoVM & {
  status: StatusDespesa;
  origem: OrigemDespesa;
  categoriaNome: string | null;
  centroGeralNome: string | null;
  contatoNome: string | null;
  transacaoDia: string | null;
  transacaoDescricao: string | null;
  temAnexo: boolean;
  anexoMime: string | null;
  registradaPorNome: string;
  /** Conta de origem quando veio de um push do banco (Sicredi/InfinitePay). */
  contaBancaria: ContaBancaria | null;
};

type Resumo = Record<"aConfirmar" | "aguardando" | "conciliadas", { quantidade: number; totalCentavos: number }>;

const FILTROS: { valor: FiltroDespesas; label: string }[] = [
  { valor: "TODAS", label: "Todas" },
  { valor: "AGUARDANDO", label: "Aguardando" },
  { valor: "CONCILIADAS", label: "Conciliadas" },
];

const ICONE_ORIGEM: Record<OrigemDespesa, typeof Mic> = {
  AUDIO: Mic,
  COMPROVANTE: Receipt,
  TEXTO: MessageSquare,
  MANUAL: PenLine,
  EXTRATO: Landmark,
  PUSH: BellRing,
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function plural(n: number, singular: string, pluralTexto: string) {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

/**
 * Despesas registradas na hora do gasto (áudio, comprovante, texto no
 * WhatsApp ou à mão), esperando o extrato pra conciliar. Pedido de 2026-10-07.
 */
export function DespesasTab({
  despesas,
  resumo,
  filtroAtual,
  hoje,
  categorias,
  centrosGerais,
  projetos,
}: {
  despesas: DespesaVM[];
  resumo: Resumo;
  filtroAtual: FiltroDespesas;
  hoje: string;
  categorias: CategoriaVM[];
  centrosGerais: CentroGeralVM[];
  projetos: ProjetoDespesaVM[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState<DespesaVM | "nova" | null>(null);

  function excluir(d: DespesaVM) {
    if (!window.confirm(`Excluir a despesa de ${centavosParaReais(d.valorCentavos)} em ${d.fornecedor}?`)) return;
    startTransition(async () => {
      const r = await excluirDespesaAction(d.id);
      if (r.error) toast.error(r.error);
      else toast.success("Despesa excluída.");
      router.refresh();
    });
  }

  function confirmar(d: DespesaVM) {
    startTransition(async () => {
      const r = await confirmarDespesaAction(d.id);
      if (r.error) {
        toast.error(`${r.error} Edite a despesa e confirme de novo.`);
        return;
      }
      toast.success("Despesa confirmada — aguardando o extrato.");
      router.refresh();
    });
  }

  return (
    <div className="flex-1 space-y-5 p-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-x-10 gap-y-3 pt-6">
          <div>
            <p className="text-3xl font-bold tabular-nums text-warning">{centavosParaReais(resumo.aguardando.totalCentavos)}</p>
            <p className="text-sm text-muted-foreground">{plural(resumo.aguardando.quantidade, "despesa aguardando", "despesas aguardando")} conciliação</p>
          </div>
          <div>
            <p className="text-xl font-bold tabular-nums text-success">{centavosParaReais(resumo.conciliadas.totalCentavos)}</p>
            <p className="text-sm text-muted-foreground">{plural(resumo.conciliadas.quantidade, "já conciliada", "já conciliadas")}</p>
          </div>
          {resumo.aConfirmar.quantidade > 0 && (
            <div>
              <p className="text-xl font-bold tabular-nums">{centavosParaReais(resumo.aConfirmar.totalCentavos)}</p>
              <p className="text-sm text-muted-foreground">{plural(resumo.aConfirmar.quantidade, "rascunho", "rascunhos")} do WhatsApp a confirmar</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-sm font-semibold">Despesas</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Mande áudio, foto do comprovante ou texto pelo WhatsApp, ou registre aqui. Quando o extrato chegar, a conciliação encontra o par.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {FILTROS.map((f) => (
                <Link
                  key={f.valor}
                  href={`/financeiro?aba=despesas${f.valor === "TODAS" ? "" : `&filtroDespesa=${f.valor}`}`}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    filtroAtual === f.valor ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {f.label}
                </Link>
              ))}
            </div>
            <Button size="sm" onClick={() => setEditando("nova")}>
              <Plus className="size-3.5" />
              Nova despesa
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {despesas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {filtroAtual === "CONCILIADAS"
                ? "Nenhuma despesa conciliada ainda."
                : "Nenhuma despesa aqui. Mande um áudio ou comprovante no WhatsApp, ou clique em Nova despesa."}
            </p>
          ) : (
            <div className="divide-y">
              {despesas.map((d) => (
                <LinhaDespesa
                  key={d.id}
                  despesa={d}
                  pending={pending}
                  onEditar={() => setEditando(d)}
                  onExcluir={() => excluir(d)}
                  onConfirmar={() => confirmar(d)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editando && (
        <DespesaDialog
          key={editando === "nova" ? "nova" : editando.id}
          open
          onOpenChange={(aberto) => !aberto && setEditando(null)}
          despesa={editando === "nova" ? undefined : editando}
          hoje={hoje}
          categorias={categorias}
          centrosGerais={centrosGerais}
          projetos={projetos}
        />
      )}
    </div>
  );
}

function LinhaDespesa({
  despesa: d,
  pending,
  onEditar,
  onExcluir,
  onConfirmar,
}: {
  despesa: DespesaVM;
  pending: boolean;
  onEditar: () => void;
  onExcluir: () => void;
  onConfirmar: () => void;
}) {
  const [, mes, dia] = d.dia.split("-");
  const Icone = ICONE_ORIGEM[d.origem];
  const ehAudio = d.anexoMime?.startsWith("audio/") ?? false;
  const centroNome = d.negocioId ? d.negocioTitulo : d.centroGeralNome;

  return (
    <div className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 py-3">
      <div className="text-center leading-tight text-muted-foreground">
        <span className="block text-lg font-bold text-foreground">{dia}</span>
        <span className="text-xs">{MESES[Number(mes) - 1]}</span>
      </div>

      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{d.fornecedor}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{d.categoriaNome ?? "Sem categoria"}</span>
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5",
              d.negocioId ? "bg-primary/10 font-medium text-primary" : "border bg-muted/50",
              !centroNome && "border-warning/40 text-warning",
            )}
          >
            {centroNome ?? "Sem centro"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Icone className="size-3" />
            {ROTULO_ORIGEM[d.origem]}
          </span>
          {d.contaBancaria && <span className="rounded-md border bg-muted/50 px-1.5 py-0.5">{ROTULO_CONTA[d.contaBancaria]}</span>}
          {d.temAnexo && (
            <a href={`/api/despesas/${d.id}/anexo`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              <Paperclip className="size-3" />
              {ehAudio ? "Ouvir áudio" : "Ver comprovante"}
            </a>
          )}
          {d.descricao && <span className="italic">{d.descricao}</span>}
        </div>
        {d.textoOriginal && (
          <details className="mt-1 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">{d.origem === "AUDIO" ? "Transcrição do áudio" : "Mensagem original"}</summary>
            <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted/60 p-2">{d.textoOriginal}</p>
          </details>
        )}
        {d.status === "CONCILIADA" && d.transacaoDia && (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            Extrato {d.transacaoDia.split("-").reverse().slice(0, 2).join("/")} · {d.transacaoDescricao}
          </p>
        )}
      </div>

      <div className="flex flex-col items-end gap-1">
        <span className="font-bold tabular-nums">{centavosParaReais(d.valorCentavos)}</span>
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              d.status === "CONCILIADA" && "bg-success/15 text-success",
              d.status === "AGUARDANDO_CONCILIACAO" && "bg-warning/15 text-warning",
              d.status === "A_CONFIRMAR" && "bg-muted text-foreground",
            )}
          >
            {ROTULO_STATUS[d.status]}
          </span>
          {d.status === "A_CONFIRMAR" && (
            <Button variant="outline" size="icon-sm" title="Confirmar (o mesmo que responder 1 no WhatsApp)" disabled={pending} onClick={onConfirmar}>
              <Check className="size-3.5" />
            </Button>
          )}
          {d.status !== "CONCILIADA" && (
            <>
              <Button variant="ghost" size="icon-sm" title="Editar" disabled={pending} onClick={onEditar}>
                <Pencil className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon-sm" title="Excluir" disabled={pending} onClick={onExcluir}>
                <X className="size-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
