"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, FileText, Loader2, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dataBR } from "@/lib/utils/contas-pagar";
import { idadeDaCotacao, itensQueCombinam, precoDoItem } from "@/lib/utils/cotacao-fornecedor";
import { diaBrasilia } from "@/lib/utils/brasilia";
import { centavosParaReais } from "@/lib/utils/money";
import type { CotacaoFornecedorVM } from "@/lib/server/cotacoes-fornecedores";
import { excluirCotacaoFornecedorAction } from "@/app/(app)/cadastros/cotacoes-fornecedores/actions";

// Cotações de fornecedores (pedido de 2026-11-24): o que os fornecedores
// cotaram, pra consultar na formação de preço. Quem salva é o agente (foto,
// print ou PDF no WhatsApp/Telegram/chat); aqui se consulta, busca e apaga.

const urlArquivo = (id: string) => `/api/cotacoes-fornecedores/arquivo/${id}`;

function Validade({ validade, hoje }: { validade: string | null; hoje: string }) {
  if (!validade) return null;
  return validade < hoje ? <Badge variant="destructive">vencida em {dataBR(validade)}</Badge> : <Badge variant="success">válida até {dataBR(validade)}</Badge>;
}

function DetalheCotacao({ c, onApagada }: { c: CotacaoFornecedorVM; onApagada: (id: string) => void }) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const condicoes = [
    c.frete && `Frete: ${c.frete}`,
    c.prazoEntrega && `Prazo: ${c.prazoEntrega}`,
    c.pagamento && `Pagamento: ${c.pagamento}`,
    c.impostos,
  ].filter(Boolean);

  function apagar() {
    if (!confirm(`Apagar a cotação nº ${c.numero} (${c.fornecedorNome}) com os itens e arquivos?`)) return;
    startTransition(async () => {
      const r = await excluirCotacaoFornecedorAction(c.id);
      if (r.error) setErro(r.error);
      else onApagada(c.id);
    });
  }

  return (
    <div className="space-y-3 border-t px-4 py-3 text-sm">
      {c.itens.length ? (
        <ol className="space-y-1.5">
          {c.itens.map((i, n) => (
            <li key={i.id} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="min-w-0 break-words text-foreground">
                <span className="text-muted-foreground">{n + 1}.</span> {i.descricao}
                {i.observacao && <span className="text-xs text-muted-foreground"> — {i.observacao}</span>}
              </span>
              <span className="shrink-0 font-medium tabular-nums">{precoDoItem(i)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground">Sem itens — veja o arquivo.</p>
      )}
      {c.totalCentavos !== null && <p className="font-semibold">Total: {centavosParaReais(c.totalCentavos)}</p>}
      {condicoes.length > 0 && <p className="text-muted-foreground">{condicoes.join(" · ")}</p>}
      {c.observacoes && <p className="text-muted-foreground">{c.observacoes}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {c.arquivos.map((a) => (
          <a
            key={a.id}
            href={urlArquivo(a.id)}
            target="_blank"
            rel="noreferrer"
            className="flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <FileText className="size-3.5 shrink-0" />
            <span className="truncate">{a.nome}</span>
          </a>
        ))}
        <Button variant="ghost" size="sm" className="ml-auto text-destructive hover:text-destructive" onClick={apagar} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          Apagar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Salva por {c.registradaPorNome}
        {c.origem === "ARQUIVO" ? " a partir do arquivo" : c.origem === "AUDIO" ? " por áudio" : c.origem === "TEXTO" ? " por mensagem" : ""}.
      </p>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}

export function ListaCotacoesFornecedores({ cotacoes: iniciais }: { cotacoes: CotacaoFornecedorVM[] }) {
  const [apagadas, setApagadas] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
  const hoje = diaBrasilia(new Date());

  const cotacoes = useMemo(
    () => iniciais.filter((c) => !apagadas.has(c.id) && (!fornecedor || c.fornecedorNome === fornecedor)),
    [iniciais, apagadas, fornecedor],
  );
  const fornecedores = useMemo(() => [...new Set(iniciais.map((c) => c.fornecedorNome))].sort((a, b) => a.localeCompare(b)), [iniciais]);
  const achados = useMemo(() => {
    if (!busca.trim()) return null;
    const itens = cotacoes.flatMap((c) => c.itens.map((i) => ({ ...i, cotacao: c })));
    return itensQueCombinam([busca], itens)
      .sort((a, b) => b.pontos - a.pontos || (a.item.precoUnitarioCentavos ?? Infinity) - (b.item.precoUnitarioCentavos ?? Infinity))
      .slice(0, 100);
  }, [busca, cotacoes]);

  const apagada = (id: string) => setApagadas((atual) => new Set(atual).add(id));

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b bg-card px-4 py-3 sm:px-6">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_16rem]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto — ex.: piso emborrachado 15mm" className="w-full min-w-0 pl-8" aria-label="Buscar produto nas cotações" />
          </div>
          <select
            value={fornecedor}
            onChange={(e) => setFornecedor(e.target.value)}
            className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm"
            aria-label="Fornecedor"
          >
            <option value="">Todos os fornecedores</option>
            {fornecedores.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">
          Mande a foto, o print ou o PDF da cotação pro agente (WhatsApp, Telegram ou o chat do CRM) que ele lê, identifica o fornecedor e os produtos e salva aqui. Pra
          consultar, pergunte a ele: &quot;busque nas cotações por …&quot;.
        </p>
      </div>

      <div className="flex-1 space-y-2 overflow-auto p-4 sm:p-6">
        {achados ? (
          achados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum item cotado combina com &quot;{busca}&quot;.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {achados.length} {achados.length === 1 ? "item" : "itens"} — do mais parecido e mais barato pro mais caro.
              </p>
              {achados.map(({ item, pontos }) => (
                <div key={item.id} className="rounded-lg border bg-card px-4 py-3 text-sm">
                  <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
                    <span className="min-w-0 break-words font-medium text-foreground">{item.descricao}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{precoDoItem(item)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{item.cotacao.fornecedorNome}</span>
                    <span>
                      · {dataBR(item.cotacao.data)} ({idadeDaCotacao(item.cotacao.data, hoje)})
                    </span>
                    <Validade validade={item.cotacao.validade} hoje={hoje} />
                    {pontos < 1 && <Badge variant="outline">parecido</Badge>}
                    <button type="button" className="text-primary underline underline-offset-2" onClick={() => { setBusca(""); setAberta(item.cotacao.id); }}>
                      ver cotação nº {item.cotacao.numero}
                    </button>
                  </div>
                </div>
              ))}
            </>
          )
        ) : cotacoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma cotação de fornecedor ainda.</p>
        ) : (
          cotacoes.map((c) => (
            <div key={c.id} className="overflow-hidden rounded-lg border bg-card">
              <button type="button" onClick={() => setAberta(aberta === c.id ? null : c.id)} className="flex w-full min-w-0 items-start gap-2 px-4 py-3 text-left hover:bg-muted/50">
                {aberta === c.id ? <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium text-foreground">{c.titulo}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>nº {c.numero}</span>
                    <span>· {dataBR(c.data)}</span>
                    <span>
                      · {c.itens.length} {c.itens.length === 1 ? "item" : "itens"}
                    </span>
                    {c.totalCentavos !== null && <span>· {centavosParaReais(c.totalCentavos)}</span>}
                    {c.negocio && <span>· obra: {c.negocio.titulo}</span>}
                    <Validade validade={c.validade} hoje={hoje} />
                  </div>
                </div>
              </button>
              {aberta === c.id && <DetalheCotacao c={c} onApagada={apagada} />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
