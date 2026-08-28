"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { corDoIndice } from "@/lib/utils/colors";
import { centavosParaReais } from "@/lib/utils/money";
import { calcularPrecificacao } from "@/lib/utils/precificacao";
import { atualizarPrecoProdutoAction } from "@/app/(app)/produtos/actions";
import type { ProdutoVM } from "@/app/(app)/produtos/produtos-shell";
import type { CampoPrecoProduto } from "@/lib/server/produtos";

function formatarPercentual(valor: number): string {
  return `${valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** `tipo="reais"` guarda em centavos mas edita/mostra em reais; `tipo="numero"` edita o valor cru (quantidade, %). */
function CelulaEditavel({
  valor,
  onSalvar,
  tipo = "numero",
  largura = "w-20",
}: {
  valor: number | null;
  onSalvar: (novoValor: number | null) => void;
  tipo?: "reais" | "numero";
  largura?: string;
}) {
  const paraTexto = (v: number | null) => (v == null ? "" : tipo === "reais" ? String(v / 100) : String(v));
  const [texto, setTexto] = useState(paraTexto(valor));
  const [pending, startTransition] = useTransition();

  return (
    <input
      type="number"
      step="0.01"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        const bruto = texto.trim() === "" ? null : Number(texto);
        if (bruto != null && Number.isNaN(bruto)) {
          setTexto(paraTexto(valor));
          return;
        }
        const novo = bruto == null ? null : tipo === "reais" ? Math.round(bruto * 100) : bruto;
        if (novo === valor) {
          setTexto(paraTexto(valor));
          return;
        }
        startTransition(() => onSalvar(novo));
      }}
      className={cn(
        largura,
        "h-7 rounded border border-transparent bg-transparent px-1.5 text-right text-xs tabular-nums outline-none transition-colors hover:border-input focus:border-ring focus:bg-background",
        pending && "opacity-50",
      )}
    />
  );
}

function LinhaProduto({ produto, onAtualizar }: { produto: ProdutoVM; onAtualizar: (id: string, campo: CampoPrecoProduto, valor: number | null) => void }) {
  const calc = useMemo(
    () =>
      calcularPrecificacao({
        custoCompraCentavos: produto.custoCompraCentavos,
        freteCustoCentavos: produto.freteCustoCentavos,
        ipiCustoCentavos: produto.ipiCustoCentavos,
        outrosCustoCentavos: produto.outrosCustoCentavos,
        quantidadeReferencia: produto.quantidadeReferencia,
        markupPercentual: produto.markupPercentual,
        impostoPercentual: produto.impostoPercentual,
        instalacaoCentavos: produto.instalacaoCentavos,
      }),
    [produto],
  );

  const salvar = (campo: CampoPrecoProduto) => (valor: number | null) => onAtualizar(produto.id, campo, valor);

  return (
    <tr className="border-t">
      <td className="sticky left-0 z-10 min-w-48 max-w-56 truncate bg-card px-2 py-1.5 text-xs font-medium">
        {produto.nome}
        {produto.codigo && <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{produto.codigo}</span>}
      </td>
      <td className="px-1 py-1">
        <CelulaEditavel valor={produto.custoCompraCentavos} onSalvar={salvar("custoCompraCentavos")} tipo="reais" />
      </td>
      <td className="px-1 py-1">
        <CelulaEditavel valor={produto.freteCustoCentavos} onSalvar={salvar("freteCustoCentavos")} tipo="reais" />
      </td>
      <td className="px-1 py-1">
        <CelulaEditavel valor={produto.ipiCustoCentavos} onSalvar={salvar("ipiCustoCentavos")} tipo="reais" />
      </td>
      <td className="px-1 py-1">
        <CelulaEditavel valor={produto.outrosCustoCentavos} onSalvar={salvar("outrosCustoCentavos")} tipo="reais" />
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
        {centavosParaReais(calc.custoTotalUnitCentavos)}
      </td>
      <td className="px-1 py-1">
        <CelulaEditavel valor={produto.quantidadeReferencia} onSalvar={salvar("quantidadeReferencia")} largura="w-14" />
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
        {centavosParaReais(calc.totalCompraCentavos)}
      </td>
      <td className="px-1 py-1">
        <CelulaEditavel valor={produto.markupPercentual} onSalvar={salvar("markupPercentual")} largura="w-16" />
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right text-xs font-semibold tabular-nums text-success">
        {centavosParaReais(calc.precoVendaCentavos)}
      </td>
      <td className="px-1 py-1">
        <CelulaEditavel valor={produto.impostoPercentual} onSalvar={salvar("impostoPercentual")} largura="w-16" />
      </td>
      <td className="px-1 py-1">
        <CelulaEditavel valor={produto.instalacaoCentavos} onSalvar={salvar("instalacaoCentavos")} tipo="reais" />
      </td>
      <td
        className={cn(
          "whitespace-nowrap px-2 py-1.5 text-right text-xs font-semibold tabular-nums",
          calc.resultadoCentavos >= 0 ? "text-success" : "text-destructive",
        )}
      >
        {centavosParaReais(calc.resultadoCentavos)}
      </td>
      <td
        className={cn(
          "whitespace-nowrap px-2 py-1.5 text-right text-xs font-semibold tabular-nums",
          calc.percentualLucro >= 0 ? "text-success" : "text-destructive",
        )}
      >
        {formatarPercentual(calc.percentualLucro)}
      </td>
    </tr>
  );
}

const CABECALHO = [
  "Descrição",
  "Compra",
  "Frete",
  "IPI",
  "Outros",
  "Custo total",
  "Qtd.",
  "Total compra",
  "Markup %",
  "Preço venda",
  "Imposto %",
  "Instalação",
  "Resultado",
  "% Lucro",
];

function CategoriaPrecos({
  categoria,
  produtos,
  cor,
  aberta,
  onToggle,
  onAtualizar,
}: {
  categoria: string;
  produtos: ProdutoVM[];
  cor: ReturnType<typeof corDoIndice>;
  aberta: boolean;
  onToggle: () => void;
  onAtualizar: (id: string, campo: CampoPrecoProduto, valor: number | null) => void;
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
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-t bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                {CABECALHO.map((titulo, i) => (
                  <th
                    key={titulo}
                    className={cn(
                      "whitespace-nowrap px-2 py-2 font-medium",
                      i === 0 ? "sticky left-0 z-10 bg-muted/40" : "text-right",
                    )}
                  >
                    {titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {produtos.map((p) => (
                <LinhaProduto key={p.id} produto={p} onAtualizar={onAtualizar} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ListaPrecos({ produtos, categoriasFixas }: { produtos: ProdutoVM[]; categoriasFixas: string[] }) {
  const [busca, setBusca] = useState("");
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [dados, setDados] = useState(produtos);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return dados;
    return dados.filter(
      (p) => p.nome.toLowerCase().includes(termo) || (p.codigo?.toLowerCase().includes(termo) ?? false) || p.categoria.toLowerCase().includes(termo),
    );
  }, [dados, busca]);

  const categorias = useMemo(() => {
    const mapa = new Map<string, ProdutoVM[]>();
    for (const c of categoriasFixas) mapa.set(c, []);
    for (const p of filtrados) {
      if (!mapa.has(p.categoria)) mapa.set(p.categoria, []);
      mapa.get(p.categoria)!.push(p);
    }
    const termo = busca.trim().length > 0;
    return [...mapa.entries()].filter(([, itens]) => !termo || itens.length > 0).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtrados, categoriasFixas, busca]);

  const buscando = busca.trim().length > 0;

  function toggle(categoria: string) {
    setAbertas((atual) => {
      const novo = new Set(atual);
      if (novo.has(categoria)) novo.delete(categoria);
      else novo.add(categoria);
      return novo;
    });
  }

  function atualizar(id: string, campo: CampoPrecoProduto, valor: number | null) {
    setDados((atual) => atual.map((p) => (p.id === id ? { ...p, [campo]: valor } : p)));
    atualizarPrecoProdutoAction(id, campo, valor).then((resultado) => {
      if ("error" in resultado) return;
      setDados((atual) => atual.map((p) => (p.id === id ? { ...p, valorCentavos: resultado.valorCentavos } : p)));
    });
  }

  return (
    <div className="flex h-full flex-col">
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
        <p className="mt-2 text-xs text-muted-foreground">
          Valores de custo em R$ por unidade. Preço de venda é calculado a partir do custo total + markup (e some junto com o
          cadastro do produto).
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-auto p-4">
        {categorias.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Nenhum produto encontrado.</p>
        ) : (
          categorias.map(([categoria, itens], indice) => (
            <CategoriaPrecos
              key={categoria}
              categoria={categoria}
              produtos={itens}
              cor={corDoIndice(indice)}
              aberta={buscando || abertas.has(categoria)}
              onToggle={() => toggle(categoria)}
              onAtualizar={atualizar}
            />
          ))
        )}
      </div>
    </div>
  );
}
