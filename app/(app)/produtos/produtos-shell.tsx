"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, ImageOff, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { corDoIndice } from "@/lib/utils/colors";
import { centavosParaReais } from "@/lib/utils/money";
import { EditarProdutoDialog } from "@/app/(app)/produtos/editar-produto-dialog";
import { NovoProdutoDialog } from "@/app/(app)/produtos/novo-produto-dialog";

export type ProdutoVM = {
  id: string;
  nome: string;
  codigo: string | null;
  categoria: string;
  descricao: string | null;
  imagemUrl: string | null;
  valorCentavos: number | null;
  ativo: boolean;
};

function ProdutoCard({ produto, onClick }: { produto: ProdutoVM; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-shadow hover:shadow-md"
    >
      <div className="flex aspect-square items-center justify-center bg-muted/40">
        {produto.imagemUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={produto.imagemUrl}
            alt={produto.nome}
            className="h-full w-full object-contain p-2"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              e.currentTarget.nextElementSibling?.classList.remove("hidden");
            }}
          />
        ) : null}
        <ImageOff className={cn("size-6 text-muted-foreground/40", produto.imagemUrl && "hidden")} />
      </div>
      <div className="space-y-0.5 p-2.5">
        <p className="line-clamp-2 text-xs font-medium leading-snug">{produto.nome}</p>
        {produto.codigo && <p className="font-mono text-[10px] text-muted-foreground">{produto.codigo}</p>}
        <p className="text-xs font-semibold text-success">
          {produto.valorCentavos != null ? centavosParaReais(produto.valorCentavos) : "Sem valor"}
        </p>
      </div>
    </button>
  );
}

function CategoriaSection({
  categoria,
  produtos,
  cor,
  aberta,
  onToggle,
  onNovoProduto,
  onEditarProduto,
}: {
  categoria: string;
  produtos: ProdutoVM[];
  cor: ReturnType<typeof corDoIndice>;
  aberta: boolean;
  onToggle: () => void;
  onNovoProduto: () => void;
  onEditarProduto: (produto: ProdutoVM) => void;
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
        <div className="space-y-3 p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {produtos.map((p) => (
              <ProdutoCard key={p.id} produto={p} onClick={() => onEditarProduto(p)} />
            ))}
            <button
              type="button"
              onClick={onNovoProduto}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <Plus className="size-5" />
              <span className="text-[11px] font-medium">Novo produto</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProdutosShell({
  produtos,
  categoriasFixas,
}: {
  produtos: ProdutoVM[];
  categoriasFixas: string[];
}) {
  const [busca, setBusca] = useState("");
  const [novoAberto, setNovoAberto] = useState(false);
  const [categoriaParaNovo, setCategoriaParaNovo] = useState<string | undefined>(undefined);
  const [editando, setEditando] = useState<ProdutoVM | null>(null);
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
    for (const c of categoriasFixas) mapa.set(c, []);
    for (const p of filtrados) {
      if (!mapa.has(p.categoria)) mapa.set(p.categoria, []);
      mapa.get(p.categoria)!.push(p);
    }
    const termo = busca.trim().length > 0;
    const entradas = [...mapa.entries()].filter(([, itens]) => !termo || itens.length > 0);
    return entradas.sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtrados, categoriasFixas, busca]);

  const todasCategorias = useMemo(
    () => [...new Set([...categoriasFixas, ...produtos.map((p) => p.categoria)])].sort(),
    [categoriasFixas, produtos],
  );

  const buscando = busca.trim().length > 0;

  function toggle(categoria: string) {
    setAbertas((atual) => {
      const novo = new Set(atual);
      if (novo.has(categoria)) novo.delete(categoria);
      else novo.add(categoria);
      return novo;
    });
  }

  function abrirNovo(categoria?: string) {
    setCategoriaParaNovo(categoria);
    setNovoAberto(true);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b bg-card px-6 py-3.5 shadow-xs">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Produtos</h1>
        <Button size="sm" onClick={() => abrirNovo(undefined)}>
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
              onNovoProduto={() => abrirNovo(categoria)}
              onEditarProduto={setEditando}
            />
          ))
        )}
      </div>

      <NovoProdutoDialog
        key={`novo-${novoAberto ? `aberto-${categoriaParaNovo ?? ""}` : "fechado"}`}
        open={novoAberto}
        onOpenChange={setNovoAberto}
        categoriasExistentes={todasCategorias}
        categoriaInicial={categoriaParaNovo}
      />
      <EditarProdutoDialog key={`editar-${editando?.id ?? "fechado"}`} produto={editando} onOpenChange={(open) => !open && setEditando(null)} />
    </div>
  );
}
