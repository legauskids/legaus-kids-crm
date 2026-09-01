"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { centavosParaReais } from "@/lib/utils/money";
import { calcularCotacao, calcularItemPorItem, type MaoDeObraItem } from "@/lib/utils/cotacao-precificacao";
import {
  atualizarTituloCotacaoAction,
  atualizarCampoResumoCotacaoAction,
  atualizarMaoDeObraCotacaoAction,
  criarItemCotacaoAction,
  atualizarItemCotacaoAction,
  excluirItemCotacaoAction,
  excluirCotacaoAction,
} from "@/app/(app)/cadastros/cotacoes/actions";
import type { CampoResumoCotacao, CampoItemCotacao } from "@/lib/server/cotacoes";

const TIPO_LABEL: Record<string, string> = {
  PLAYGROUND: "Playground",
  KIDPLAY: "Kidplay",
  BRINQUEDOS: "Brinquedos",
  OUTROS: "Outros",
};

// Tipos que calculam por item (cada linha com seu próprio markup/frete/
// instalação/imposto) em vez de um resumo único pro projeto inteiro.
const TIPOS_POR_ITEM = new Set(["OUTROS"]);

const SECAO_PADRAO_POR_ITEM = "Itens";

export type ItemVM = {
  id: string;
  secao: string;
  nome: string;
  quantidade: number;
  custoUnitarioCentavos: number;
  ordem: number;
  antecipacaoIcmsPercentual: number;
  freteCentavos: number;
  instalacaoCentavos: number;
  markup: number;
  impostoPercentual: number;
};

export type CotacaoDetalheVM = {
  id: string;
  numero: number;
  tipo: string;
  titulo: string;
  itens: ItemVM[];
  maoDeObra: MaoDeObraItem[];
  markup: number;
  adicionalCentavos: number;
  instalacaoPercentual: number;
  freteKm: number;
  fretePrecoPorKmCentavos: number;
  impostoCentavos: number;
  criadoPorNome: string;
  criadoEm: string;
};

function CelulaTexto({ valor, onSalvar, className }: { valor: string; onSalvar: (novo: string) => void; className?: string }) {
  const [texto, setTexto] = useState(valor);
  return (
    <input
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      onBlur={() => {
        if (texto.trim() === "") {
          setTexto(valor);
          return;
        }
        if (texto === valor) return;
        onSalvar(texto);
      }}
      className={cn(
        "h-7 w-full rounded border border-transparent bg-transparent px-1.5 text-xs outline-none transition-colors hover:border-input focus:border-ring focus:bg-background",
        className,
      )}
    />
  );
}

function CelulaNumero({
  valor,
  onSalvar,
  tipo = "numero",
  largura = "w-24",
}: {
  valor: number;
  onSalvar: (novo: number) => void;
  tipo?: "reais" | "numero";
  largura?: string;
}) {
  const paraTexto = (v: number) => (tipo === "reais" ? String(v / 100) : String(v));
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
        const bruto = texto.trim() === "" ? 0 : Number(texto);
        if (Number.isNaN(bruto)) {
          setTexto(paraTexto(valor));
          return;
        }
        const novo = tipo === "reais" ? Math.round(bruto * 100) : bruto;
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

function LinhaResumo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function LinhaResumoCalculada({ label, valorCentavos, destaque }: { label: string; valorCentavos: number; destaque?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-1.5", destaque && "border-t pt-2")}>
      <span className={cn("text-xs", destaque ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</span>
      <span className={cn("text-xs tabular-nums", destaque ? "font-semibold" : "text-foreground")}>{centavosParaReais(valorCentavos)}</span>
    </div>
  );
}

export function CotacaoEditor({ cotacao: inicial }: { cotacao: CotacaoDetalheVM }) {
  const router = useRouter();
  const modoPorItem = TIPOS_POR_ITEM.has(inicial.tipo);
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [itens, setItens] = useState(inicial.itens);
  const [maoDeObra, setMaoDeObra] = useState(inicial.maoDeObra);
  const [markup, setMarkup] = useState(inicial.markup);
  const [adicionalCentavos, setAdicionalCentavos] = useState(inicial.adicionalCentavos);
  const [instalacaoPercentual, setInstalacaoPercentual] = useState(inicial.instalacaoPercentual);
  const [freteKm, setFreteKm] = useState(inicial.freteKm);
  const [fretePrecoPorKmCentavos, setFretePrecoPorKmCentavos] = useState(inicial.fretePrecoPorKmCentavos);
  const [impostoCentavos, setImpostoCentavos] = useState(inicial.impostoCentavos);
  const [novaSecao, setNovaSecao] = useState("");
  const [excluindo, startExcluir] = useTransition();

  const secoes = useMemo(() => {
    const mapa = new Map<string, ItemVM[]>();
    for (const item of [...itens].sort((a, b) => a.ordem - b.ordem)) {
      if (!mapa.has(item.secao)) mapa.set(item.secao, []);
      mapa.get(item.secao)!.push(item);
    }
    return [...mapa.entries()];
  }, [itens]);

  const resultado = useMemo(
    () =>
      calcularCotacao({
        itens: itens.map((i) => ({ quantidade: i.quantidade, custoUnitarioCentavos: i.custoUnitarioCentavos })),
        maoDeObra,
        markup,
        adicionalCentavos,
        instalacaoPercentual,
        freteKm,
        fretePrecoPorKmCentavos,
        impostoCentavos,
      }),
    [itens, maoDeObra, markup, adicionalCentavos, instalacaoPercentual, freteKm, fretePrecoPorKmCentavos, impostoCentavos],
  );

  const resultadosPorItem = useMemo(() => {
    const mapa = new Map<string, ReturnType<typeof calcularItemPorItem>>();
    for (const item of itens) {
      mapa.set(
        item.id,
        calcularItemPorItem({
          quantidade: item.quantidade,
          custoUnitarioCentavos: item.custoUnitarioCentavos,
          antecipacaoIcmsPercentual: item.antecipacaoIcmsPercentual,
          freteCentavos: item.freteCentavos,
          instalacaoCentavos: item.instalacaoCentavos,
          markup: item.markup,
          impostoPercentual: item.impostoPercentual,
        }),
      );
    }
    return mapa;
  }, [itens]);

  const totaisPorItem = useMemo(() => {
    let totalCentavos = 0;
    let vendaCentavos = 0;
    let impostoCentavos = 0;
    let custoFinalCentavos = 0;
    let lucroCentavos = 0;
    for (const r of resultadosPorItem.values()) {
      totalCentavos += r.totalCentavos;
      vendaCentavos += r.vendaCentavos;
      impostoCentavos += r.impostoCentavos;
      custoFinalCentavos += r.custoFinalCentavos;
      lucroCentavos += r.lucroCentavos;
    }
    const percentualLucro = vendaCentavos > 0 ? (lucroCentavos / vendaCentavos) * 100 : 0;
    return { totalCentavos, vendaCentavos, impostoCentavos, custoFinalCentavos, lucroCentavos, percentualLucro };
  }, [resultadosPorItem]);

  function salvarItem(id: string, campo: CampoItemCotacao, valor: string | number) {
    setItens((atual) => atual.map((i) => (i.id === id ? { ...i, [campo]: valor } : i)));
    atualizarItemCotacaoAction(id, campo, valor);
  }

  async function adicionarItem(secao: string) {
    const { id } = await criarItemCotacaoAction(inicial.id, secao);
    setItens((atual) => [
      ...atual,
      {
        id,
        secao,
        nome: "Novo item",
        quantidade: 0,
        custoUnitarioCentavos: 0,
        ordem: atual.length,
        antecipacaoIcmsPercentual: 0,
        freteCentavos: 0,
        instalacaoCentavos: 0,
        markup: 1.9,
        impostoPercentual: 7,
      },
    ]);
  }

  async function excluirItem(id: string) {
    setItens((atual) => atual.filter((i) => i.id !== id));
    await excluirItemCotacaoAction(id);
  }

  async function adicionarSecao() {
    const nome = novaSecao.trim();
    if (!nome) return;
    setNovaSecao("");
    await adicionarItem(nome);
  }

  function salvarMaoDeObra(indice: number, valorCentavos: number) {
    setMaoDeObra((atual) => atual.map((m, i) => (i === indice ? { ...m, valorCentavos } : m)));
    atualizarMaoDeObraCotacaoAction(inicial.id, indice, valorCentavos);
  }

  function campoResumo<T extends number>(setter: (v: T) => void, campo: CampoResumoCotacao) {
    return (valor: T) => {
      setter(valor);
      atualizarCampoResumoCotacaoAction(inicial.id, campo, valor);
    };
  }

  function excluirCotacao() {
    if (!confirm("Excluir essa cotação? Não dá pra desfazer.")) return;
    startExcluir(async () => {
      await excluirCotacaoAction(inicial.id);
      router.push("/cadastros");
    });
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b bg-card px-6 py-3.5 shadow-xs">
        <Link href="/cadastros" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Cadastros
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">
            #{String(inicial.numero).padStart(4, "0")} · {TIPO_LABEL[inicial.tipo] ?? inicial.tipo}
          </span>
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onBlur={() => {
              if (titulo.trim() === "") {
                setTitulo(inicial.titulo);
                return;
              }
              if (titulo !== inicial.titulo) atualizarTituloCotacaoAction(inicial.id, titulo);
            }}
            className="min-w-64 flex-1 rounded border border-transparent bg-transparent px-1 text-lg font-bold tracking-tight text-foreground outline-none hover:border-input focus:border-ring focus:bg-background"
          />
          <Button variant="ghost" size="sm" className="text-destructive" disabled={excluindo} onClick={excluirCotacao}>
            {excluindo ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            Excluir cotação
          </Button>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 p-6 xl:grid-cols-[1fr_320px]">
        {modoPorItem ? (
          <div className="space-y-3">
            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Item</th>
                      <th className="w-20 px-2 py-2 text-right font-medium">Qtd.</th>
                      <th className="w-24 px-2 py-2 text-right font-medium">Valor unit.</th>
                      <th className="w-24 px-2 py-2 text-right font-medium">Total</th>
                      <th className="w-20 px-2 py-2 text-right font-medium">Antecip. ICMS %</th>
                      <th className="w-20 px-2 py-2 text-right font-medium">Frete</th>
                      <th className="w-24 px-2 py-2 text-right font-medium">Instalação</th>
                      <th className="w-16 px-2 py-2 text-right font-medium">Markup</th>
                      <th className="w-24 px-2 py-2 text-right font-medium">Venda</th>
                      <th className="w-16 px-2 py-2 text-right font-medium">Imposto %</th>
                      <th className="w-24 px-2 py-2 text-right font-medium">Custo final</th>
                      <th className="w-24 px-3 py-2 text-right font-medium">Lucro</th>
                      <th className="w-16 px-2 py-2 text-right font-medium">%</th>
                      <th className="w-8 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {[...itens]
                      .sort((a, b) => a.ordem - b.ordem)
                      .map((item) => {
                        const r = resultadosPorItem.get(item.id)!;
                        return (
                          <tr key={item.id} className="border-b last:border-b-0">
                            <td className="min-w-40 px-2 py-1">
                              <CelulaTexto valor={item.nome} onSalvar={(v) => salvarItem(item.id, "nome", v)} />
                            </td>
                            <td className="px-2 py-1">
                              <CelulaNumero valor={item.quantidade} onSalvar={(v) => salvarItem(item.id, "quantidade", v)} largura="w-16" />
                            </td>
                            <td className="px-2 py-1">
                              <CelulaNumero
                                valor={item.custoUnitarioCentavos}
                                onSalvar={(v) => salvarItem(item.id, "custoUnitarioCentavos", v)}
                                tipo="reais"
                                largura="w-20"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{centavosParaReais(r.totalCentavos)}</td>
                            <td className="px-2 py-1">
                              <CelulaNumero
                                valor={item.antecipacaoIcmsPercentual}
                                onSalvar={(v) => salvarItem(item.id, "antecipacaoIcmsPercentual", v)}
                                largura="w-16"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <CelulaNumero valor={item.freteCentavos} onSalvar={(v) => salvarItem(item.id, "freteCentavos", v)} tipo="reais" largura="w-16" />
                            </td>
                            <td className="px-2 py-1">
                              <CelulaNumero
                                valor={item.instalacaoCentavos}
                                onSalvar={(v) => salvarItem(item.id, "instalacaoCentavos", v)}
                                tipo="reais"
                                largura="w-20"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <CelulaNumero valor={item.markup} onSalvar={(v) => salvarItem(item.id, "markup", v)} largura="w-14" />
                            </td>
                            <td className="px-2 py-1.5 text-right font-medium tabular-nums">{centavosParaReais(r.vendaCentavos)}</td>
                            <td className="px-2 py-1">
                              <CelulaNumero valor={item.impostoPercentual} onSalvar={(v) => salvarItem(item.id, "impostoPercentual", v)} largura="w-14" />
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{centavosParaReais(r.custoFinalCentavos)}</td>
                            <td
                              className={cn("px-3 py-1.5 text-right font-medium tabular-nums", r.lucroCentavos >= 0 ? "text-success" : "text-destructive")}
                            >
                              {centavosParaReais(r.lucroCentavos)}
                            </td>
                            <td className={cn("px-2 py-1.5 text-right tabular-nums", r.lucroCentavos >= 0 ? "text-success" : "text-destructive")}>
                              {r.percentualLucro.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                            </td>
                            <td className="px-1 py-1 text-center">
                              <button
                                type="button"
                                onClick={() => excluirItem(item.id)}
                                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                title="Excluir linha"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              <div className="border-t px-3 py-1.5">
                <button
                  type="button"
                  onClick={() => adicionarItem(SECAO_PADRAO_POR_ITEM)}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Plus className="size-3.5" />
                  Inserir item
                </button>
              </div>
            </Card>
          </div>
        ) : (
          <div className="space-y-3">
            {secoes.map(([secao, itensDaSecao]) => (
              <Card key={secao} className="overflow-hidden py-0">
                <div className="border-b bg-muted/40 px-4 py-2 text-sm font-semibold">{secao}</div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Item</th>
                        <th className="w-24 px-2 py-2 text-right font-medium">Quantidade</th>
                        <th className="w-28 px-2 py-2 text-right font-medium">Custo unit.</th>
                        <th className="w-28 px-3 py-2 text-right font-medium">Custo total</th>
                        <th className="w-8 px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {itensDaSecao.map((item) => (
                        <tr key={item.id} className="border-b last:border-b-0">
                          <td className="px-2 py-1">
                            <CelulaTexto valor={item.nome} onSalvar={(v) => salvarItem(item.id, "nome", v)} />
                          </td>
                          <td className="px-2 py-1">
                            <CelulaNumero valor={item.quantidade} onSalvar={(v) => salvarItem(item.id, "quantidade", v)} largura="w-20" />
                          </td>
                          <td className="px-2 py-1">
                            <CelulaNumero
                              valor={item.custoUnitarioCentavos}
                              onSalvar={(v) => salvarItem(item.id, "custoUnitarioCentavos", v)}
                              tipo="reais"
                              largura="w-24"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                            {centavosParaReais(Math.round(item.quantidade * item.custoUnitarioCentavos))}
                          </td>
                          <td className="px-1 py-1 text-center">
                            <button
                              type="button"
                              onClick={() => excluirItem(item.id)}
                              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              title="Excluir linha"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t px-3 py-1.5">
                  <button
                    type="button"
                    onClick={() => adicionarItem(secao)}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="size-3.5" />
                    Inserir item
                  </button>
                </div>
              </Card>
            ))}

            <Card className="p-3">
              <div className="flex items-center gap-2">
                <input
                  value={novaSecao}
                  onChange={(e) => setNovaSecao(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") adicionarSecao();
                  }}
                  placeholder="Nome da nova seção (ex: Torre, Descidas...)"
                  className="h-8 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus:border-ring"
                />
                <Button size="sm" variant="outline" onClick={adicionarSecao} disabled={!novaSecao.trim()}>
                  <Plus className="size-3.5" />
                  Nova seção
                </Button>
              </div>
            </Card>
          </div>
        )}

        <div className="xl:sticky xl:top-0 xl:self-start">
          <Card>
            <CardContent className="p-4">
              {modoPorItem ? (
                <>
                  <h2 className="mb-2 text-sm font-semibold text-foreground">Totais do projeto</h2>
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    Cada item já calcula seu próprio markup, frete, instalação e imposto — aqui é só a soma de tudo.
                  </p>
                  <LinhaResumoCalculada label="Total (custo material)" valorCentavos={totaisPorItem.totalCentavos} />
                  <LinhaResumoCalculada label="Venda" valorCentavos={totaisPorItem.vendaCentavos} destaque />
                  <LinhaResumoCalculada label="Imposto" valorCentavos={totaisPorItem.impostoCentavos} />
                  <LinhaResumoCalculada label="Custo final" valorCentavos={totaisPorItem.custoFinalCentavos} />
                  <div
                    className={cn(
                      "flex items-center justify-between border-t pt-2",
                      totaisPorItem.lucroCentavos >= 0 ? "text-success" : "text-destructive",
                    )}
                  >
                    <span className="text-xs font-semibold">Lucro</span>
                    <span className="text-xs font-semibold tabular-nums">{centavosParaReais(totaisPorItem.lucroCentavos)}</span>
                  </div>
                  <div className={cn("flex items-center justify-between", totaisPorItem.lucroCentavos >= 0 ? "text-success" : "text-destructive")}>
                    <span className="text-xs font-semibold">Percentual</span>
                    <span className="text-xs font-semibold tabular-nums">
                      {totaisPorItem.percentualLucro.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="mb-2 text-sm font-semibold text-foreground">Resumo e margem</h2>

                  {maoDeObra.map((m, indice) => (
                    <LinhaResumo key={m.label} label={m.label}>
                      <CelulaNumero valor={m.valorCentavos} onSalvar={(v) => salvarMaoDeObra(indice, v)} tipo="reais" largura="w-24" />
                    </LinhaResumo>
                  ))}

                  <LinhaResumoCalculada label="Total materiais" valorCentavos={resultado.totalMateriaisCentavos} />
                  <LinhaResumoCalculada label="Total mão de obra" valorCentavos={resultado.totalMaoDeObraCentavos} />

                  <LinhaResumo label="Markup (multiplicador)">
                    <CelulaNumero valor={markup} onSalvar={campoResumo(setMarkup, "markup")} largura="w-20" />
                  </LinhaResumo>
                  <LinhaResumoCalculada label="Preço venda calculado" valorCentavos={resultado.precoVendaCalculadoCentavos} />

                  <LinhaResumo label="Adicional">
                    <CelulaNumero valor={adicionalCentavos} onSalvar={campoResumo(setAdicionalCentavos, "adicionalCentavos")} tipo="reais" largura="w-24" />
                  </LinhaResumo>
                  <LinhaResumoCalculada label="Preço de venda total" valorCentavos={resultado.precoDeVendaTotalCentavos} />

                  <LinhaResumo label="Instalação (%)">
                    <CelulaNumero
                      valor={instalacaoPercentual}
                      onSalvar={campoResumo(setInstalacaoPercentual, "instalacaoPercentual")}
                      largura="w-20"
                    />
                  </LinhaResumo>
                  <LinhaResumoCalculada label="Preço venda com instalação" valorCentavos={resultado.precoVendaComInstalacaoCentavos} />

                  <LinhaResumo label="Frete — Km">
                    <CelulaNumero valor={freteKm} onSalvar={campoResumo(setFreteKm, "freteKm")} largura="w-20" />
                  </LinhaResumo>
                  <LinhaResumo label="Frete — preço/Km">
                    <CelulaNumero
                      valor={fretePrecoPorKmCentavos}
                      onSalvar={campoResumo(setFretePrecoPorKmCentavos, "fretePrecoPorKmCentavos")}
                      tipo="reais"
                      largura="w-24"
                    />
                  </LinhaResumo>
                  <LinhaResumoCalculada label="Valor frete" valorCentavos={resultado.valorFreteCentavos} />

                  <LinhaResumo label="Imposto (R$)">
                    <CelulaNumero valor={impostoCentavos} onSalvar={campoResumo(setImpostoCentavos, "impostoCentavos")} tipo="reais" largura="w-24" />
                  </LinhaResumo>

                  <LinhaResumoCalculada label="Total de custos" valorCentavos={resultado.totalDeCustosCentavos} />
                  <LinhaResumoCalculada label="Total (cobrado do cliente)" valorCentavos={resultado.totalCentavos} destaque />

                  <div className={cn("flex items-center justify-between border-t pt-2", resultado.resultadoCentavos >= 0 ? "text-success" : "text-destructive")}>
                    <span className="text-xs font-semibold">Resultado</span>
                    <span className="text-xs font-semibold tabular-nums">{centavosParaReais(resultado.resultadoCentavos)}</span>
                  </div>
                  <div className={cn("flex items-center justify-between", resultado.resultadoCentavos >= 0 ? "text-success" : "text-destructive")}>
                    <span className="text-xs font-semibold">Percentual</span>
                    <span className="text-xs font-semibold tabular-nums">
                      {resultado.percentualLucro.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
