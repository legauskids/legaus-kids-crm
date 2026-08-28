"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { centavosParaReais } from "@/lib/utils/money";
import { Search } from "lucide-react";

export type ProdutoParaEscolha = {
  id: string;
  nome: string;
  codigo: string | null;
  categoria: string;
  imagemUrl: string | null;
  valorCentavos: number | null;
};

export function AdicionarProdutoDialog({
  open,
  onOpenChange,
  produtos,
  onEscolher,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  produtos: ProdutoParaEscolha[];
  onEscolher: (produto: ProdutoParaEscolha) => void;
}) {
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return produtos.slice(0, 60);
    return produtos
      .filter((p) => p.nome.toLowerCase().includes(termo) || (p.codigo?.toLowerCase().includes(termo) ?? false))
      .slice(0, 60);
  }, [produtos, busca]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar produto</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Buscar por nome ou código..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {filtrados.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Nenhum produto encontrado.</p>}
          {filtrados.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onEscolher(p);
                onOpenChange(false);
                setBusca("");
              }}
              className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent"
            >
              <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/40">
                {p.imagemUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imagemUrl} alt="" className="h-full w-full object-contain" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.nome}</p>
                <p className="text-xs text-muted-foreground">{p.categoria}</p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-success">
                {p.valorCentavos != null ? centavosParaReais(p.valorCentavos) : "Sem valor"}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
