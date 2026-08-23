"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { centavosParaReais } from "@/lib/utils/money";
import { negocioParadoAlemDoPrazo } from "@/lib/utils/dates";
import { KanbanBoard, type KanbanItemDef } from "@/components/shared/kanban/board";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { moverNegocioAction, marcarPerdidoAction } from "@/app/(app)/negocios/actions";
import { atualizarEtapaAction } from "@/app/(app)/negocios/funis/actions";
import { NovoNegocioDialog } from "@/app/(app)/negocios/novo-negocio-dialog";
import { MotivoPerdaDialog } from "@/app/(app)/negocios/motivo-perda-dialog";

type Etapa = { id: string; nome: string; ordem: number; slaDias: number | null; tipo: "NORMAL" | "GANHO" | "PERDIDO" };
type Funil = { id: string; nome: string; etapas: Etapa[] };
type NegocioCard = {
  id: string;
  titulo: string;
  etapaId: string;
  valorCentavos: number;
  dataEntradaNaEtapa: string;
  contatoNome: string;
  responsavelNome: string;
};

export function NegociosBoardShell({
  funis,
  funilSelecionadoId,
  negocios,
  contatos,
  usuarios,
}: {
  funis: Funil[];
  funilSelecionadoId: string;
  negocios: NegocioCard[];
  contatos: { id: string; nome: string }[];
  usuarios: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [items, setItems] = useState<KanbanItemDef<NegocioCard>[]>(() => toItems(negocios));
  const [negociosAnteriores, setNegociosAnteriores] = useState(negocios);
  const [novoOpen, setNovoOpen] = useState(false);
  const [motivoDialog, setMotivoDialog] = useState<{ negocioId: string; etapaId: string } | null>(null);

  if (negocios !== negociosAnteriores) {
    setNegociosAnteriores(negocios);
    setItems(toItems(negocios));
  }

  const funilSelecionado = funis.find((f) => f.id === funilSelecionadoId) ?? funis[0];
  if (!funilSelecionado) {
    return <p className="p-6 text-muted-foreground">Nenhum funil cadastrado ainda.</p>;
  }

  const etapasOrdenadas = [...funilSelecionado.etapas].sort((a, b) => a.ordem - b.ordem);
  const etapaPorId = new Map(etapasOrdenadas.map((e) => [e.id, e]));

  function commitMove(negocioId: string, novaEtapaId: string) {
    setItems((prev) => prev.map((i) => (i.id === negocioId ? { ...i, columnId: novaEtapaId } : i)));
    startTransition(async () => {
      await moverNegocioAction(negocioId, novaEtapaId);
      router.refresh();
    });
  }

  function handleDrop(negocioId: string, toEtapaId: string) {
    const etapaDestino = etapaPorId.get(toEtapaId);
    if (!etapaDestino) return;
    if (etapaDestino.tipo === "PERDIDO") {
      setMotivoDialog({ negocioId, etapaId: toEtapaId });
      return;
    }
    commitMove(negocioId, toEtapaId);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex flex-wrap gap-1">
          {funis.map((f) => (
            <Link
              key={f.id}
              href={`/negocios?funil=${f.id}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                f.id === funilSelecionado.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {f.nome}
            </Link>
          ))}
        </div>
        <Button size="sm" onClick={() => setNovoOpen(true)}>
          <Plus className="size-4" />
          Novo negócio
        </Button>
      </div>

      <div className="flex-1 overflow-hidden">
        <KanbanBoard
          id={`negocios-${funilSelecionado.id}`}
          columns={etapasOrdenadas.map((e) => ({
            id: e.id,
            label: <EtapaColunaLabel key={e.id} etapa={e} onSlaChange={() => router.refresh()} />,
            accent: e.tipo === "PERDIDO" ? "danger" : "default",
          }))}
          items={items}
          onDrop={handleDrop}
          renderCard={(item) => {
            const etapa = etapaPorId.get(item.columnId);
            const atrasado = negocioParadoAlemDoPrazo({
              slaDias: etapa?.slaDias ?? null,
              dataEntradaNaEtapa: new Date(item.data.dataEntradaNaEtapa),
            });
            return (
              <Link
                href={`/negocios/${item.id}`}
                className={cn(
                  "block space-y-1 rounded-md p-3 text-sm",
                  atrasado && "border-2 border-destructive bg-destructive/10",
                )}
              >
                <p className="font-medium leading-snug">{item.data.titulo}</p>
                <p className="text-xs text-muted-foreground">{item.data.contatoNome}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-medium">{centavosParaReais(item.data.valorCentavos)}</span>
                  <span className="text-xs text-muted-foreground">{item.data.responsavelNome}</span>
                </div>
                {atrasado && (
                  <p className="text-xs font-medium text-destructive">Parado além do prazo</p>
                )}
              </Link>
            );
          }}
        />
      </div>

      <NovoNegocioDialog
        open={novoOpen}
        onOpenChange={setNovoOpen}
        funilId={funilSelecionado.id}
        etapaPadraoId={etapasOrdenadas[0]?.id ?? ""}
        contatos={contatos}
        usuarios={usuarios}
      />

      <MotivoPerdaDialog
        open={motivoDialog != null}
        onOpenChange={(open) => !open && setMotivoDialog(null)}
        onConfirm={async (motivo) => {
          if (!motivoDialog) return;
          setItems((prev) =>
            prev.map((i) => (i.id === motivoDialog.negocioId ? { ...i, columnId: motivoDialog.etapaId } : i)),
          );
          await marcarPerdidoAction(motivoDialog.negocioId, motivo);
          setMotivoDialog(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function toItems(negocios: NegocioCard[]): KanbanItemDef<NegocioCard>[] {
  return negocios.map((n) => ({ id: n.id, columnId: n.etapaId, data: n }));
}

function EtapaColunaLabel({ etapa, onSlaChange }: { etapa: Etapa; onSlaChange: () => void }) {
  const [, startTransition] = useTransition();

  return (
    <span className="flex items-center gap-1 text-sm font-medium">
      {etapa.nome}
      <span
        className="flex items-center gap-0.5 text-xs font-normal text-muted-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        · SLA
        <input
          type="number"
          min={0}
          // key força o input (não controlado) a refletir o valor do servidor
          // se ele mudar por fora, ex. editado em /negocios/funis.
          key={etapa.slaDias}
          defaultValue={etapa.slaDias ?? ""}
          placeholder="–"
          onBlur={(e) => {
            const value = e.target.value.trim();
            const slaDias = value ? Number(value) : null;
            if (slaDias !== etapa.slaDias) {
              startTransition(async () => {
                await atualizarEtapaAction(etapa.id, { slaDias });
                onSlaChange();
              });
            }
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="w-8 rounded border bg-transparent px-0.5 text-center outline-none focus:ring-1 focus:ring-primary"
        />
        d
      </span>
    </span>
  );
}
