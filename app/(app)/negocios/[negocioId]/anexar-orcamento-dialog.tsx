"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { FilePlus, FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { anexarOrcamentoAction, listarOrcamentosParaAnexarAction } from "@/app/(app)/negocios/[negocioId]/orcamento-actions";
import { centavosParaReais } from "@/lib/utils/money";
import type { OrcamentoParaAnexar } from "@/lib/server/orcamentos";

// "Anexar orçamento" do histórico do negócio (pedido de 2026-11-23): escolhe
// um orçamento já feito (os do cliente do negócio primeiro) ou abre um novo
// já vinculado a este negócio.

const STATUS = { RASCUNHO: "rascunho", ENVIADO: "enviado", APROVADO: "aprovado", RECUSADO: "recusado", EXPIRADO: "expirado" } as const;
const FALHA = "Não foi possível falar com o CRM agora — confira a internet e tente de novo.";

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function AnexarOrcamentoDialog({ negocioId, disabled }: { negocioId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [lista, setLista] = useState<OrcamentoParaAnexar[] | null>(null);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function abrir() {
    setOpen(true);
    setLista(null);
    setBusca("");
    setErro(null);
    listarOrcamentosParaAnexarAction(negocioId)
      .then((r) => ("error" in r ? setErro(r.error) : setLista(r.orcamentos)))
      .catch(() => setErro(FALHA));
  }

  function anexar(orcamentoId: string) {
    setErro(null);
    startTransition(async () => {
      const r = await anexarOrcamentoAction(negocioId, orcamentoId).catch(() => ({ error: FALHA }));
      if ("error" in r) setErro(r.error);
      else setOpen(false);
    });
  }

  const termo = semAcento(busca.trim());
  const digitos = busca.replace(/\D/g, "");
  const filtrados = (lista ?? []).filter(
    (o) => !termo || (digitos !== "" && String(o.numero).includes(String(Number(digitos)))) || semAcento(o.cliente ?? "").includes(termo),
  );
  const grupos = [
    { titulo: "Do cliente deste negócio", itens: filtrados.filter((o) => o.doCliente) },
    { titulo: "Outros orçamentos", itens: filtrados.filter((o) => !o.doCliente) },
  ].filter((g) => g.itens.length > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" size="sm" onClick={abrir} disabled={disabled}>
        <FileText className="size-4" />
        Anexar orçamento
      </Button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Anexar orçamento</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-sm text-muted-foreground">
          O orçamento entra no histórico deste negócio e, no Ganho, vai junto para o pós-venda.
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Número do orçamento ou nome do cliente"
            className="pl-8"
            aria-label="Buscar orçamento"
          />
        </div>

        <div className="max-h-80 space-y-3 overflow-y-auto">
          {lista === null && !erro && <p className="py-6 text-center text-sm text-muted-foreground">Carregando orçamentos...</p>}
          {lista !== null && grupos.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {lista.length === 0 ? "Nenhum orçamento para anexar." : "Nenhum orçamento com esse número ou cliente."}
            </p>
          )}
          {grupos.map((g) => (
            <div key={g.titulo} className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{g.titulo}</p>
              <ul className="space-y-1">
                {g.itens.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => anexar(o.id)}
                      disabled={pending}
                      className="flex w-full items-start justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="font-medium">nº {String(o.numero).padStart(4, "0")}</span>
                        <span className="text-muted-foreground"> · {STATUS[o.status]}</span>
                        <span className="block break-words">{o.cliente ?? "Sem cliente"}</span>
                        {o.negocioAtual && (
                          <span className="block break-words text-xs text-warning">Está no negócio “{o.negocioAtual}” e passa para este.</span>
                        )}
                      </span>
                      <span className="shrink-0 text-muted-foreground">{centavosParaReais(o.totalCentavos)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {erro && <p className="text-sm text-destructive">{erro}</p>}
        <DialogFooter>
          <Button asChild variant="outline">
            <Link href={`/orcamentos/novo?negocio=${negocioId}`}>
              <FilePlus className="size-4" />
              Criar orçamento novo para este negócio
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
