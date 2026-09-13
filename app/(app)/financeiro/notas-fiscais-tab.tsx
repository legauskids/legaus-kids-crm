"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centavosParaReais, reaisParaCentavos } from "@/lib/utils/money";
import { FileText, FileCode, RefreshCw, AlertTriangle, Plus, Trash2 } from "lucide-react";
import { criarNotaFiscalAction, atualizarStatusNotaFiscalAction, tentarEmitirNotaFiscalAction } from "@/app/(app)/financeiro/actions";

type StatusNotaFiscal = "NAO_EMITIDA" | "PROCESSANDO" | "AUTORIZADA" | "REJEITADA" | "CANCELADA";

const STATUS_LABEL: Record<StatusNotaFiscal, string> = {
  NAO_EMITIDA: "Não emitida",
  PROCESSANDO: "Processando",
  AUTORIZADA: "Autorizada",
  REJEITADA: "Rejeitada",
  CANCELADA: "Cancelada",
};

const STATUS_COR: Record<StatusNotaFiscal, string> = {
  NAO_EMITIDA: "text-muted-foreground",
  PROCESSANDO: "text-amber-600",
  AUTORIZADA: "text-success",
  REJEITADA: "text-destructive",
  CANCELADA: "text-muted-foreground",
};

type ItemForm = {
  descricao: string;
  quantidade: number;
  valorUnitarioCentavos: number;
  ncm: string;
  cfop: string;
  unidade: string;
  icmsSituacaoTributaria: string;
};

function itemVazio(): ItemForm {
  return { descricao: "", quantidade: 1, valorUnitarioCentavos: 0, ncm: "", cfop: "", unidade: "UN", icmsSituacaoTributaria: "" };
}

export type ContatoVM = { id: string; nome: string; cnpj: string | null; representanteLegalCpf: string | null };
export type NegocioOrigemVM = { id: string; contatoId: string; titulo: string; produto: string | null; descricao: string | null; valorCentavos: number };
export type OrcamentoOrigemVM = {
  id: string;
  contatoId: string;
  numero: number;
  descontoCentavos: number;
  itens: { nome: string; descricao: string | null; quantidade: number; valorUnitarioCentavos: number }[];
};

export type NotaFiscalVM = {
  id: string;
  status: StatusNotaFiscal;
  numero: string | null;
  motivoRejeicao: string | null;
  valorTotalCentavos: number;
  criadaEm: string;
  contatoNome: string;
  origemLabel: string | null;
  temXml: boolean;
  temDanfe: boolean;
};

export function NotasFiscaisTab({
  contatos,
  negocios,
  orcamentos,
  notasFiscais,
  focusNfeConfigurado,
}: {
  contatos: ContatoVM[];
  negocios: NegocioOrigemVM[];
  orcamentos: OrcamentoOrigemVM[];
  notasFiscais: NotaFiscalVM[];
  focusNfeConfigurado: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [erroLinha, setErroLinha] = useState<{ notaFiscalId: string; mensagem: string } | null>(null);

  const [contatoId, setContatoId] = useState("");
  const [origem, setOrigem] = useState<{ tipo: "negocio" | "orcamento"; id: string } | null>(null);
  const [itens, setItens] = useState<ItemForm[]>([]);

  const negociosDoCliente = useMemo(() => negocios.filter((n) => n.contatoId === contatoId), [negocios, contatoId]);
  const orcamentosDoCliente = useMemo(() => orcamentos.filter((o) => o.contatoId === contatoId), [orcamentos, contatoId]);

  function escolherCliente(id: string) {
    setContatoId(id);
    setOrigem(null);
    setItens([]);
    setErro(null);
  }

  function carregarDeNegocio(negocioId: string) {
    const n = negociosDoCliente.find((x) => x.id === negocioId);
    if (!n) return;
    setOrigem({ tipo: "negocio", id: negocioId });
    setItens([
      {
        descricao: n.descricao || n.produto || n.titulo,
        quantidade: 1,
        valorUnitarioCentavos: n.valorCentavos,
        ncm: "",
        cfop: "",
        unidade: "UN",
        icmsSituacaoTributaria: "",
      },
    ]);
  }

  function carregarDeOrcamento(orcamentoId: string) {
    const o = orcamentosDoCliente.find((x) => x.id === orcamentoId);
    if (!o) return;
    setOrigem({ tipo: "orcamento", id: orcamentoId });
    setItens(
      o.itens.map((i) => ({
        descricao: i.descricao || i.nome,
        quantidade: i.quantidade,
        valorUnitarioCentavos: i.valorUnitarioCentavos,
        ncm: "",
        cfop: "",
        unidade: "UN",
        icmsSituacaoTributaria: "",
      })),
    );
  }

  function atualizarItem<K extends keyof ItemForm>(indice: number, campo: K, valor: ItemForm[K]) {
    setItens((atual) => atual.map((it, i) => (i === indice ? { ...it, [campo]: valor } : it)));
  }

  function adicionarItem() {
    setItens((atual) => [...atual, itemVazio()]);
  }

  function removerItem(indice: number) {
    setItens((atual) => atual.filter((_, i) => i !== indice));
  }

  const orcamentoSelecionado = origem?.tipo === "orcamento" ? orcamentosDoCliente.find((o) => o.id === origem.id) : null;
  const valorTotal = itens.reduce((soma, i) => soma + i.quantidade * i.valorUnitarioCentavos, 0);
  const podeEmitir =
    contatoId && itens.length > 0 && itens.every((i) => i.descricao.trim() && i.ncm.trim() && i.cfop.trim() && i.icmsSituacaoTributaria.trim());

  function emitir() {
    setErro(null);
    startTransition(async () => {
      const resultado = await criarNotaFiscalAction(contatoId, origem?.tipo === "negocio" ? origem.id : undefined, origem?.tipo === "orcamento" ? origem.id : undefined, itens);
      if (resultado.error) {
        setErro(resultado.error);
        return;
      }
      escolherCliente("");
      router.refresh();
    });
  }

  function verificarStatus(notaFiscalId: string) {
    setErroLinha(null);
    startTransition(async () => {
      const resultado = await atualizarStatusNotaFiscalAction(notaFiscalId);
      if (resultado.error) {
        setErroLinha({ notaFiscalId, mensagem: resultado.error });
        return;
      }
      router.refresh();
    });
  }

  function tentarEmitirDeNovo(notaFiscalId: string) {
    setErroLinha(null);
    startTransition(async () => {
      const resultado = await tentarEmitirNotaFiscalAction(notaFiscalId);
      if (resultado.error) {
        setErroLinha({ notaFiscalId, mensagem: resultado.error });
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex-1 space-y-5 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Emitir nota fiscal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!focusNfeConfigurado && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Emissão ainda não configurada (falta certificado digital e-CNPJ + conta na Focus NFe, ver .env.example). Dá pra deixar
                a nota pronta aqui — quando configurar, use &quot;Tentar emitir&quot; na lista abaixo pra mandar de verdade.
              </span>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <select
                value={contatoId}
                onChange={(e) => escolherCliente(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">Escolha o cliente...</option>
                {contatos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                    {!c.cnpj && !c.representanteLegalCpf ? " (sem CNPJ/CPF)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Negócio (opcional)</Label>
              <select
                value={origem?.tipo === "negocio" ? origem.id : ""}
                onChange={(e) => (e.target.value ? carregarDeNegocio(e.target.value) : setOrigem(null))}
                disabled={!contatoId}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-50"
              >
                <option value="">Nenhum</option>
                {negociosDoCliente.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.titulo} ({centavosParaReais(n.valorCentavos)})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Orçamento (opcional)</Label>
              <select
                value={origem?.tipo === "orcamento" ? origem.id : ""}
                onChange={(e) => (e.target.value ? carregarDeOrcamento(e.target.value) : setOrigem(null))}
                disabled={!contatoId}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-50"
              >
                <option value="">Nenhum</option>
                {orcamentosDoCliente.map((o) => (
                  <option key={o.id} value={o.id}>
                    #{String(o.numero).padStart(4, "0")} ({o.itens.length} item{o.itens.length === 1 ? "" : "s"})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {orcamentoSelecionado && orcamentoSelecionado.descontoCentavos > 0 && (
            <p className="text-xs text-muted-foreground">
              Esse orçamento tem desconto de {centavosParaReais(orcamentoSelecionado.descontoCentavos)} — não foi aplicado
              automaticamente nos itens abaixo, ajuste manualmente se quiser refletir no valor da nota.
            </p>
          )}

          {contatoId && (
            <div className="space-y-3 border-t pt-3">
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
                Confirme <strong>NCM</strong>, <strong>CFOP</strong> e <strong>CST/CSOSN</strong> de cada item com o contador antes da
                primeira emissão real — são códigos fiscais específicos do produto e do regime tributário, não preenchi um valor
                padrão de propósito.
              </div>

              {itens.map((item, indice) => (
                <div key={indice} className="grid grid-cols-12 gap-2 rounded-lg border p-2.5">
                  <div className="col-span-12 sm:col-span-3">
                    <Label className="text-[11px]">Descrição</Label>
                    <Input value={item.descricao} onChange={(e) => atualizarItem(indice, "descricao", e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="col-span-4 sm:col-span-1">
                    <Label className="text-[11px]">Qtd</Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantidade}
                      onChange={(e) => atualizarItem(indice, "quantidade", Number(e.target.value) || 1)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="col-span-8 sm:col-span-2">
                    <Label className="text-[11px]">Valor unit. (R$)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={(item.valorUnitarioCentavos / 100).toFixed(2)}
                      onChange={(e) => atualizarItem(indice, "valorUnitarioCentavos", reaisParaCentavos(Number(e.target.value) || 0))}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <Label className="text-[11px]">NCM</Label>
                    <Input value={item.ncm} onChange={(e) => atualizarItem(indice, "ncm", e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="col-span-4 sm:col-span-1">
                    <Label className="text-[11px]">CFOP</Label>
                    <Input value={item.cfop} onChange={(e) => atualizarItem(indice, "cfop", e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="col-span-4 sm:col-span-1">
                    <Label className="text-[11px]">CST/CSOSN</Label>
                    <Input
                      value={item.icmsSituacaoTributaria}
                      onChange={(e) => atualizarItem(indice, "icmsSituacaoTributaria", e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="col-span-10 sm:col-span-1">
                    <Label className="text-[11px]">Unidade</Label>
                    <Input value={item.unidade} onChange={(e) => atualizarItem(indice, "unidade", e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="col-span-2 sm:col-span-1 flex items-end justify-end">
                    <Button variant="outline" size="icon-sm" onClick={() => removerItem(indice)} title="Remover item">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={adicionarItem}>
                  <Plus className="mr-1 size-3.5" />
                  Adicionar item
                </Button>
                <p className="text-sm font-medium">Total: {centavosParaReais(valorTotal)}</p>
              </div>

              {erro && <p className="text-sm text-destructive">{erro}</p>}

              <Button disabled={!podeEmitir || pending} onClick={emitir}>
                {pending ? "Enviando..." : focusNfeConfigurado ? "Emitir nota fiscal" : "Salvar (emitir depois)"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Notas fiscais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {notasFiscais.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma nota fiscal emitida ainda.</p>
          ) : (
            notasFiscais.map((n) => (
              <div key={n.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {n.numero ? `NF-e #${n.numero}` : "Nota fiscal"} · <span className={STATUS_COR[n.status]}>{STATUS_LABEL[n.status]}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {n.contatoNome}
                    {n.origemLabel ? ` · ${n.origemLabel}` : ""} · {centavosParaReais(n.valorTotalCentavos)} ·{" "}
                    {new Date(n.criadaEm).toLocaleDateString("pt-BR")}
                  </p>
                  {n.motivoRejeicao && <p className="text-xs text-destructive">{n.motivoRejeicao}</p>}
                  {erroLinha?.notaFiscalId === n.id && <p className="text-xs text-destructive">{erroLinha.mensagem}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {n.temXml && (
                    <a href={`/api/nota-fiscal/${n.id}/xml`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary underline underline-offset-2">
                      <FileCode className="size-3.5" /> XML
                    </a>
                  )}
                  {n.temDanfe && (
                    <a href={`/api/nota-fiscal/${n.id}/danfe`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary underline underline-offset-2">
                      <FileText className="size-3.5" /> DANFE
                    </a>
                  )}
                  {n.status === "PROCESSANDO" && (
                    <Button variant="outline" size="sm" disabled={pending} onClick={() => verificarStatus(n.id)}>
                      <RefreshCw className="mr-1 size-3.5" /> Verificar status
                    </Button>
                  )}
                  {(n.status === "NAO_EMITIDA" || n.status === "REJEITADA") && (
                    <Button variant="outline" size="sm" disabled={pending} onClick={() => tentarEmitirDeNovo(n.id)}>
                      Tentar emitir
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
