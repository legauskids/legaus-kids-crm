"use client";

import { useMemo, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Plus, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { corDoIndice } from "@/lib/utils/colors";
import {
  atualizarDescricaoProdutoAction,
  atualizarValorProdutoAction,
  excluirProdutoAction,
} from "@/app/(app)/produtos/actions";
import { NovoProdutoDialog } from "@/app/(app)/produtos/novo-produto-dialog";

export type ProdutoVM = {
  id: string;
  nome: string;
  codigo: string | null;
  categoria: string;
  descricao: string | null;
  valorCentavos: number | null;
  ativo: boolean;
};

function ProdutoRow({ produto }: { produto: ProdutoVM }) {
  const [, startTransition] = useTransition();
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  return (
    <tr className="border-t">
      <td className="px-3 py-2">
        <p className="font-medium leading-snug">{produto.nome}</p>
        {produto.codigo && <p className="font-mono text-[11px] text-muted-foreground">{produto.codigo}</p>}
      </td>
      <td className="px-3 py-2">
        <Input
          key={`d-${produto.id}-${produto.descricao}`}
          defaultValue={produto.descricao ?? ""}
          placeholder="Sem descrição ainda..."
          className="h-8 text-xs"
          onBlur={(e) => {
            const valor = e.target.value;
            if (valor !== (produto.descricao ?? "")) {
              startTransition(() => atualizarDescricaoProdutoAction(produto.id, valor));
            }
          }}
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">R$</span>
          <Input
            key={`v-${produto.id}-${produto.valorCentavos}`}
            type="number"
            min="0"
            step="0.01"
            defaultValue={produto.valorCentavos != null ? (produto.valorCentavos / 100).toFixed(2) : ""}
            placeholder="—"
            className="h-8 w-28 text-xs"
            onBlur={(e) => {
              const texto = e.target.value.trim();
              const valorAtual = produto.valorCentavos != null ? (produto.valorCentavos / 100).toFixed(2) : "";
              if (texto !== valorAtual) {
                startTransition(() =>
                  atualizarValorProdutoAction(produto.id, texto === "" ? null : Number(texto)),
                );
              }
            }}
          />
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        {confirmandoExclusao ? (
          <div className="flex items-center justify-end gap-1">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => startTransition(() => excluirProdutoAction(produto.id))}
            >
              Confirmar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmandoExclusao(false)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="icon-sm" title="Excluir" onClick={() => setConfirmandoExclusao(true)}>
            <Trash2 className="size-3.5 text-muted-foreground" />
          </Button>
        )}
      </td>
    </tr>
  );
}

function CategoriaSection({
  categoria,
  produtos,
  cor,
  aberta,
  onToggle,
}: {
  categoria: string;
  produtos: ProdutoVM[];
  cor: ReturnType<typeof corDoIndice>;
  aberta: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={cn("overflow-hidden rounded-lg border", cor.border)}>
      <button
        type="button"
        onClick={onToggle}
        className={cn("flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors", cor.bg)}
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className={cn("size-1.5 rounded-full", cor.dot)} />
          {categoria}
          <Badge variant="secondary" className="ml-1">
            {produtos.length}
          </Badge>
        </span>
        {aberta ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
      </button>
      {aberta && (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Produto</th>
              <th className="px-3 py-2 font-medium">Descrição</th>
              <th className="px-3 py-2 font-medium">Valor</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {produtos.map((p) => (
              <ProdutoRow key={p.id} produto={p} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function ProdutosShell({ produtos }: { produtos: ProdutoVM[] }) {
  const [busca, setBusca] = useState("");
  const [novoAberto, setNovoAberto] = useState(false);
  const [abertas, setAbertas] = useState<Set<string>>(new Set());

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return produtos;
    return produtos.filter(
      (p) =>
        p.nome.toLowerCase().includes(termo) ||
        (p.codigo?.toLowerCase().includes(termo) ?? false) ||
        p.categoria.toLowerCase().includes(termo),
    );
  }, [produtos, busca]);

  const categorias = useMemo(() => {
    const mapa = new Map<string, ProdutoVM[]>();
    for (const p of filtrados) {
      if (!mapa.has(p.categoria)) mapa.set(p.categoria, []);
      mapa.get(p.categoria)!.push(p);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtrados]);

  const buscando = busca.trim().length > 0;

  function toggle(categoria: string) {
    setAbertas((atual) => {
      const novo = new Set(atual);
      if (novo.has(categoria)) novo.delete(categoria);
      else novo.add(categoria);
      return novo;
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b bg-card px-6 py-3.5 shadow-xs">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Produtos</h1>
        <Button size="sm" onClick={() => setNovoAberto(true)}>
          <Plus className="size-4" />
          Novo produto
        </Button>
      </div>

      <div className="border-b bg-card px-6 py-3">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, código ou categoria..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-auto p-4">
        {categorias.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Nenhum produto encontrado.</p>
        ) : (
          categorias.map(([categoria, itens], indice) => (
            <CategoriaSection
              key={categoria}
              categoria={categoria}
              produtos={itens}
              cor={corDoIndice(indice)}
              aberta={buscando || abertas.has(categoria)}
              onToggle={() => toggle(categoria)}
            />
          ))
        )}
      </div>

      <NovoProdutoDialog open={novoAberto} onOpenChange={setNovoAberto} categoriasExistentes={[...new Set(produtos.map((p) => p.categoria))].sort()} />
    </div>
  );
}
