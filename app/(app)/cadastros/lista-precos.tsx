"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { corDoIndice } from "@/lib/utils/colors";
import { centavosParaReais } from "@/lib/utils/money";
import { calcularPrecificacao } from "@/lib/utils/precificacao";
import { atualizarPrecoProdutoAction, aplicarPrecoEmMassaAction } from "@/app/(app)/produtos/actions";
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
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
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

/** Campo vazio no cabeçalho da categoria — aplica o valor digitado a todos os itens dessa categoria (Enter ou blur) e volta a ficar vazio. */
function CelulaAplicarMassa({
  tipo,
  largura = "w-16",
  onAplicar,
}: {
  tipo: "reais" | "numero";
  largura?: string;
  onAplicar: (valor: number) => void;
}) {
  const [texto, setTexto] = useState("");

  function commit() {
    const bruto = texto.trim() === "" ? null : Number(texto);
    setTexto("");
    if (bruto == null || Number.isNaN(bruto)) return;
    onAplicar(tipo === "reais" ? Math.round(bruto * 100) : bruto);
  }

  return (
    <input
      type="number"
      step="0.01"
      value={texto}
      placeholder="todos"
      onChange={(e) => setTexto(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      onBlur={commit}
      className={cn(
        largura,
        "h-6 rounded border border-dashed border-input bg-transparent px-1.5 text-right text-[10px] italic tabular-nums outline-none placeholder:text-muted-foreground/50 focus:border-ring focus:bg-background focus:not-italic",
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
        <CelulaEditavel
          key={produto.custoCompraCentavos}
          valor={produto.custoCompraCentavos}
          onSalvar={salvar("custoCompraCentavos")}
          tipo="reais"
        />
      </td>
      <td className="px-1 py-1">
        <CelulaEditavel
          key={produto.freteCustoCentavos}
          valor={produto.freteCustoCentavos}
          onSalvar={salvar("freteCustoCentavos")}
          tipo="reais"
        />
      </td>
      <td className="px-1 py-1">
        <CelulaEditavel key={produto.ipiCustoCentavos} valor={produto.ipiCustoCentavos} onSalvar={salvar("ipiCustoCentavos")} tipo="reais" />
      </td>
      <td className="px-1 py-1">
        <CelulaEditavel
          key={produto.outrosCustoCentavos}
          valor={produto.outrosCustoCentavos}
          onSalvar={salvar("outrosCustoCentavos")}
          tipo="reais"
        />
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
        {centavosParaReais(calc.custoTotalUnitCentavos)}
      </td>
      <td className="px-1 py-1">
        <CelulaEditavel
          key={produto.quantidadeReferencia}
          valor={produto.quantidadeReferencia}
          onSalvar={salvar("quantidadeReferencia")}
          largura="w-14"
        />
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
        {centavosParaReais(calc.totalCompraCentavos)}
      </td>
      <td className="px-1 py-1">
        <CelulaEditavel key={produto.markupPercentual} valor={produto.markupPercentual} onSalvar={salvar("markupPercentual")} largura="w-16" />
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right text-xs font-semibold tabular-nums text-success">
        {centavosParaReais(calc.precoVendaCentavos)}
      </td>
      <td className="px-1 py-1">
        <CelulaEditavel key={produto.impostoPercentual} valor={produto.impostoPercentual} onSalvar={salvar("impostoPercentual")} largura="w-16" />
      </td>
      <td className="px-1 py-1">
        <CelulaEditavel key={produto.instalacaoCentavos} valor={produto.instalacaoCentavos} onSalvar={salvar("instalacaoCentavos")} tipo="reais" />
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

// Colunas que aceitam aplicar o mesmo valor pra todos os itens da categoria.
const COLUNAS_EM_MASSA: Record<number, { campo: CampoPrecoProduto; tipo: "reais" | "numero" }> = {
  3: { campo: "ipiCustoCentavos", tipo: "reais" },
  4: { campo: "outrosCustoCentavos", tipo: "reais" },
  8: { campo: "markupPercentual", tipo: "numero" },
  10: { campo: "impostoPercentual", tipo: "numero" },
};

function CategoriaPrecos({
  categoria,
  produtos,
  cor,
  aberta,
  onToggle,
  onAtualizar,
  onAplicarEmMassa,
}: {
  categoria: string;
  produtos: ProdutoVM[];
  cor: ReturnType<typeof corDoIndice>;
  aberta: boolean;
  onToggle: () => void;
  onAtualizar: (id: string, campo: CampoPrecoProduto, valor: number | null) => void;
  onAplicarEmMassa: (categoria: string, campo: CampoPrecoProduto, valor: number) => void;
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
              <tr className="border-t bg-muted/10">
                <th className="sticky left-0 z-10 bg-muted/10 px-2 py-1 text-left text-[10px] italic text-muted-foreground/70">
                  Aplicar a todos ↓
                </th>
                {CABECALHO.slice(1).map((_, indice) => {
                  const coluna = COLUNAS_EM_MASSA[indice + 1];
                  return (
                    <th key={indice} className="px-1 py-1 text-right">
                      {coluna && (
                        <CelulaAplicarMassa
                          tipo={coluna.tipo}
                          largura={coluna.tipo === "reais" ? "w-20" : "w-16"}
                          onAplicar={(valor) => onAplicarEmMassa(categoria, coluna.campo, valor)}
                        />
                      )}
                    </th>
                  );
                })}
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

export function ListaPrecos({
  produtos,
  categoriasFixas,
  onAtualizarProduto,
}: {
  produtos: ProdutoVM[];
  categoriasFixas: string[];
  onAtualizarProduto: (id: string, patch: Partial<ProdutoVM>) => void;
}) {
  const [busca, setBusca] = useState("");
  const [abertas, setAbertas] = useState<Set<string>>(new Set());

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return produtos;
    return produtos.filter(
      (p) => p.nome.toLowerCase().includes(termo) || (p.codigo?.toLowerCase().includes(termo) ?? false) || p.categoria.toLowerCase().includes(termo),
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
    onAtualizarProduto(id, { [campo]: valor } as Partial<ProdutoVM>);
    atualizarPrecoProdutoAction(id, campo, valor).then((resultado) => {
      if ("error" in resultado) return;
      onAtualizarProduto(id, { valorCentavos: resultado.valorCentavos });
    });
  }

  function aplicarEmMassa(categoria: string, campo: CampoPrecoProduto, valor: number) {
    // Atualiza a UI de todo mundo na hora (mesmo cálculo isomórfico do
    // servidor) e manda UM request só pro backend — chamar a action de
    // linha única em loop pra cada item estourava o pool de conexões em
    // categorias grandes.
    for (const p of produtos) {
      if (p.categoria !== categoria) continue;
      const atualizado = { ...p, [campo]: valor };
      const { custoTotalUnitCentavos, precoVendaCentavos } = calcularPrecificacao(atualizado);
      onAtualizarProduto(p.id, {
        [campo]: valor,
        ...(custoTotalUnitCentavos > 0 ? { valorCentavos: precoVendaCentavos } : {}),
      } as Partial<ProdutoVM>);
    }
    aplicarPrecoEmMassaAction(categoria, campo, valor);
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
          cadastro do produto). Enter confirma a célula. A linha pontilhada no topo de cada categoria aplica o valor pra todos
          os itens dela.
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
              onAplicarEmMassa={aplicarEmMassa}
            />
          ))
        )}
      </div>
    </div>
  );
}
