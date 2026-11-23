"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, FileDown, FileSpreadsheet, Paperclip, Pencil, Plus, Repeat, SlidersHorizontal, Undo2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { centavosParaReais } from "@/lib/utils/money";
import {
  ROTULO_GRUPO,
  ROTULO_SITUACAO,
  agruparContas,
  centroDaConta,
  dataBR,
  fimDoMes,
  filtroVazio,
  parametrosDoFiltro,
  prazoLegivel,
  rotuloParcela,
  somarMeses,
  totaisPor,
  type ContaPagarVM,
  type FiltroContas,
  type GrupoConta,
  type SituacaoFiltro,
} from "@/lib/utils/contas-pagar";
import { desfazerPagamentoAction, excluirContaPagarAction } from "@/app/(app)/financeiro/contas-pagar-actions";
import { ContaPagarDialog } from "@/app/(app)/financeiro/conta-pagar-dialog";
import { PagarContaDialog } from "@/app/(app)/financeiro/pagar-conta-dialog";
import { SeletorCentroDespesa, type CategoriaVM, type CentroGeralVM, type ProjetoDespesaVM } from "@/app/(app)/financeiro/despesa-dialog";

type Soma = { quantidade: number; totalCentavos: number };
export type ResumoContas = { atrasadas: Soma; hoje: Soma; seteDias: Soma; emAberto: Soma; aConfirmar: number };

const SITUACOES: SituacaoFiltro[] = ["ABERTAS", "PAGAS", "TODAS"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function plural(n: number, singular: string, pluralTexto: string) {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

function hrefDoFiltro(f: FiltroContas, base = "/financeiro?aba=contas-pagar") {
  const p = parametrosDoFiltro(f).toString();
  return p ? `${base}&${p}` : base;
}

/**
 * Contas a pagar (pedido de 2026-11-23): boletos, faturas, contas fixas e
 * parcelas, agrupadas pelo vencimento. Paga, a conta vira despesa e segue
 * para a conciliação.
 */
export function ContasPagarTab({
  contas,
  resumo,
  filtro,
  hoje,
  categorias,
  centrosGerais,
  projetos,
}: {
  contas: ContaPagarVM[];
  resumo: ResumoContas;
  filtro: FiltroContas;
  hoje: string;
  categorias: CategoriaVM[];
  centrosGerais: CentroGeralVM[];
  projetos: ProjetoDespesaVM[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState<ContaPagarVM | "nova" | null>(null);
  const [pagando, setPagando] = useState<ContaPagarVM | null>(null);
  const grupos = agruparContas(contas, hoje);
  const parametros = parametrosDoFiltro(filtro).toString();
  const sufixo = parametros ? `?${parametros}` : "";

  function excluir(c: ContaPagarVM) {
    const parcela = rotuloParcela(c.parcela, c.totalParcelas);
    const pergunta = c.repeteTodoMes
      ? `Tirar o mês de ${dataBR(c.vencimento)} da conta fixa ${c.fornecedor}? Os outros meses continuam.`
      : `Excluir ${parcela ? `a parcela ${parcela}` : "a conta"} de ${centavosParaReais(c.valorCentavos)} (${c.fornecedor})?`;
    if (!window.confirm(pergunta)) return;
    startTransition(async () => {
      const r = await excluirContaPagarAction(c.id);
      if (r.error) toast.error(r.error);
      else toast.success(c.repeteTodoMes ? "Mês tirado da conta fixa." : "Conta excluída.");
      router.refresh();
    });
  }

  function desfazer(c: ContaPagarVM) {
    if (!window.confirm(`Voltar a conta ${c.fornecedor} para em aberto? A despesa criada pelo pagamento é apagada; uma despesa que já existia antes só é desligada.`)) return;
    startTransition(async () => {
      const r = await desfazerPagamentoAction(c.id);
      if (r.error) toast.error(r.error);
      else toast.success("Pagamento desfeito — a conta voltou para em aberto.");
      router.refresh();
    });
  }

  return (
    <div className="flex-1 space-y-5 p-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-x-10 gap-y-3 pt-6">
          <Numero valor={resumo.atrasadas} rotulo={plural(resumo.atrasadas.quantidade, "atrasada", "atrasadas")} className={resumo.atrasadas.quantidade ? "text-destructive" : ""} destaque />
          <Numero valor={resumo.hoje} rotulo={`${plural(resumo.hoje.quantidade, "vence", "vencem")} hoje`} className={resumo.hoje.quantidade ? "text-warning" : ""} />
          <Numero valor={resumo.seteDias} rotulo="nos próximos 7 dias" />
          <Numero valor={resumo.emAberto} rotulo={`em aberto (${plural(resumo.emAberto.quantidade, "conta", "contas")})`} />
          {resumo.aConfirmar > 0 && <p className="text-sm text-muted-foreground">{plural(resumo.aConfirmar, "rascunho", "rascunhos")} do WhatsApp/Telegram a confirmar</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-sm font-semibold">Contas a pagar</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">Boletos, faturas, contas fixas e parcelas. Paga, a conta vira despesa e segue para a conciliação.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {SITUACOES.map((s) => (
                <Link
                  key={s}
                  href={hrefDoFiltro({ ...filtro, situacao: s })}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    filtro.situacao === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {ROTULO_SITUACAO[s]}
                </Link>
              ))}
            </div>
            <Button size="sm" onClick={() => setEditando("nova")}>
              <Plus className="size-3.5" />
              Nova conta
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Filtros filtro={filtro} hoje={hoje} categorias={categorias} centrosGerais={centrosGerais} projetos={projetos} />

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <p className="text-sm text-muted-foreground">
              {plural(contas.length, "conta", "contas")} · <span className="font-semibold text-foreground">{centavosParaReais(contas.reduce((s, c) => s + c.valorCentavos, 0))}</span>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/contas-pagar/planilha${sufixo}`}>
                  <FileSpreadsheet className="size-3.5" />
                  Excel
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/pdf/contas-pagar${sufixo}`} target="_blank" rel="noreferrer">
                  <FileDown className="size-3.5" />
                  PDF
                </a>
              </Button>
            </div>
          </div>

          {contas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {filtroVazio(filtro) && filtro.situacao === "ABERTAS" ? "Nenhuma conta em aberto. Clique em Nova conta para lançar um boleto, uma fatura ou uma conta fixa." : "Nenhuma conta com esse filtro."}
            </p>
          ) : (
            grupos.map((g) => (
              <section key={g.grupo}>
                <div className={cn("flex items-center justify-between rounded-md px-2 py-1.5 text-sm font-semibold", COR_GRUPO[g.grupo])}>
                  <span>
                    {ROTULO_GRUPO[g.grupo]} <span className="font-normal opacity-80">· {plural(g.contas.length, "conta", "contas")}</span>
                  </span>
                  <span className="tabular-nums">{centavosParaReais(g.totalCentavos)}</span>
                </div>
                <div className="divide-y">
                  {g.contas.map((c) => (
                    <LinhaConta
                      key={c.id}
                      conta={c}
                      hoje={hoje}
                      pending={pending}
                      onPagar={() => setPagando(c)}
                      onEditar={() => setEditando(c)}
                      onExcluir={() => excluir(c)}
                      onDesfazer={() => desfazer(c)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </CardContent>
      </Card>

      {contas.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Totais titulo="Por categoria" linhas={totaisPor(contas, (c) => c.categoriaNome ?? "Sem categoria")} />
          <Totais titulo="Por centro e projeto" linhas={totaisPor(contas, centroDaConta)} />
        </div>
      )}

      {editando && (
        <ContaPagarDialog
          key={editando === "nova" ? "nova" : editando.id}
          open
          onOpenChange={(aberto) => !aberto && setEditando(null)}
          conta={editando === "nova" ? undefined : editando}
          categorias={categorias}
          centrosGerais={centrosGerais}
          projetos={projetos}
        />
      )}
      {pagando && <PagarContaDialog key={pagando.id} conta={pagando} hoje={hoje} open onOpenChange={(aberto) => !aberto && setPagando(null)} />}
    </div>
  );
}

const COR_GRUPO: Record<GrupoConta, string> = {
  ATRASADAS: "bg-destructive/10 text-destructive",
  HOJE: "bg-warning/15 text-warning",
  SETE_DIAS: "bg-muted text-foreground",
  MES: "bg-muted text-foreground",
  DEPOIS: "bg-muted text-foreground",
  PAGAS: "bg-success/10 text-success",
};

function Numero({ valor, rotulo, className, destaque }: { valor: Soma; rotulo: string; className?: string; destaque?: boolean }) {
  return (
    <div>
      <p className={cn("font-bold tabular-nums", destaque ? "text-3xl" : "text-xl", className)}>{centavosParaReais(valor.totalCentavos)}</p>
      <p className="text-sm text-muted-foreground">{rotulo}</p>
    </div>
  );
}

/** Filtros por GET na própria URL — a planilha e o PDF usam os mesmos. */
function Filtros({
  filtro,
  hoje,
  categorias,
  centrosGerais,
  projetos,
}: {
  filtro: FiltroContas;
  hoje: string;
  categorias: CategoriaVM[];
  centrosGerais: CentroGeralVM[];
  projetos: ProjetoDespesaVM[];
}) {
  const [centro, setCentro] = useState(filtro.centro ?? "");
  // No celular os filtros ficam fechados (abertos se já há algum filtro).
  const [aberto, setAberto] = useState(!filtroVazio(filtro));
  const inicioDoMes = `${hoje.slice(0, 7)}-01`;
  const mesQueVem = somarMeses(inicioDoMes, 1);
  const atalhos = [
    { label: "Este mês", de: inicioDoMes, ate: fimDoMes(hoje) },
    { label: "Mês que vem", de: mesQueVem, ate: fimDoMes(mesQueVem) },
  ];
  return (
    <>
      <Button type="button" variant="outline" size="sm" className="lg:hidden" onClick={() => setAberto(!aberto)} aria-expanded={aberto}>
        <SlidersHorizontal className="size-3.5" />
        {aberto ? "Esconder filtros" : "Filtros"}
      </Button>
      <form
        method="get"
        action="/financeiro"
        className={cn(
          "grid-cols-1 gap-2 text-xs font-medium text-muted-foreground sm:grid-cols-2 lg:grid lg:grid-cols-[auto_auto_1fr_1fr_1fr_auto]",
          aberto ? "grid" : "hidden",
        )}
      >
        <input type="hidden" name="aba" value="contas-pagar" />
        {filtro.situacao !== "ABERTAS" && <input type="hidden" name="situacao" value={filtro.situacao} />}
        <label className="grid min-w-0 gap-1">
          Vencimento de
          <Input type="date" name="de" defaultValue={filtro.de ?? ""} className="text-foreground" />
        </label>
        <label className="grid min-w-0 gap-1">
          até
          <Input type="date" name="ate" defaultValue={filtro.ate ?? ""} className="text-foreground" />
        </label>
        <label className="grid min-w-0 gap-1">
          Categoria
          <select name="categoria" defaultValue={filtro.categoriaId ?? ""} className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground">
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1">
          Centro ou projeto
          <SeletorCentroDespesa valor={centro} onChange={setCentro} centrosGerais={centrosGerais} projetos={projetos} rotuloVazio="Todos" className="w-full min-w-0 text-foreground" />
          <input type="hidden" name="centro" value={centro} />
        </label>
        <label className="grid min-w-0 gap-1">
          Fornecedor
          <Input name="fornecedor" defaultValue={filtro.fornecedor ?? ""} placeholder="Parte do nome" className="text-foreground" />
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" size="sm" variant="secondary" className="h-9">
            Filtrar
          </Button>
          {!filtroVazio(filtro) && (
            <Link href={hrefDoFiltro({ ...filtro, de: null, ate: null, categoriaId: null, centro: null, fornecedor: null })} className="pb-2 text-primary hover:underline">
              Limpar
            </Link>
          )}
        </div>
        <div className="flex flex-wrap gap-3 sm:col-span-2 lg:col-span-6">
          {atalhos.map((a) => (
            <Link key={a.label} href={hrefDoFiltro({ ...filtro, de: a.de, ate: a.ate })} className="text-primary hover:underline">
              {a.label}
            </Link>
          ))}
        </div>
      </form>
    </>
  );
}

function LinhaConta({
  conta: c,
  hoje,
  pending,
  onPagar,
  onEditar,
  onExcluir,
  onDesfazer,
}: {
  conta: ContaPagarVM;
  hoje: string;
  pending: boolean;
  onPagar: () => void;
  onEditar: () => void;
  onExcluir: () => void;
  onDesfazer: () => void;
}) {
  const [, mes, dia] = c.vencimento.split("-");
  const parcela = rotuloParcela(c.parcela, c.totalParcelas);
  const paga = c.status === "PAGA";
  const atrasada = !paga && c.vencimento < hoje;
  const centroNome = centroDaConta(c);

  function copiarCodigo() {
    if (!c.codigoPagamento) return;
    navigator.clipboard
      .writeText(c.codigoPagamento)
      .then(() => toast.success("Código copiado — é só colar no app do banco."))
      .catch(() => toast.error("Não consegui copiar. Abra a conta em Editar e copie de lá."));
  }

  return (
    <div className="grid grid-cols-[3rem_1fr] items-center gap-3 py-3 sm:grid-cols-[3rem_1fr_auto]">
      <div className={cn("text-center leading-tight text-muted-foreground", atrasada && "text-destructive")}>
        <span className={cn("block text-lg font-bold", atrasada ? "text-destructive" : "text-foreground")}>{dia}</span>
        <span className="text-xs">{MESES[Number(mes) - 1]}</span>
      </div>

      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="min-w-0 break-words font-medium text-foreground">{c.fornecedor}</span>
          {parcela && <span className="rounded-md border bg-muted/50 px-1.5 py-0.5 text-[11px] text-muted-foreground">parcela {parcela}</span>}
          {c.repeteTodoMes && (
            <span className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-1.5 py-0.5 text-[11px] text-muted-foreground">
              <Repeat className="size-3" />
              fixa
            </span>
          )}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{c.categoriaNome ?? "Sem categoria"}</span>
          <span className={cn("rounded-md px-1.5 py-0.5", c.negocioId ? "bg-primary/10 font-medium text-primary" : "border bg-muted/50")}>{centroNome}</span>
          {paga ? (
            <span className="text-success">
              Paga em {c.pagaEm ? dataBR(c.pagaEm) : "—"} · {c.despesaConciliada ? "conciliada" : "aguardando o extrato"}
            </span>
          ) : (
            <span className={cn(atrasada && "font-semibold text-destructive", c.vencimento === hoje && "font-semibold text-warning")}>{prazoLegivel(c.vencimento, hoje)}</span>
          )}
          {c.temAnexo && (
            <a href={`/api/contas-pagar/${c.id}/anexo`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              <Paperclip className="size-3" />
              Ver boleto
            </a>
          )}
          {c.codigoPagamento && !paga && (
            <button type="button" onClick={copiarCodigo} className="inline-flex items-center gap-1 text-primary hover:underline">
              <Copy className="size-3" />
              Copiar código
            </button>
          )}
          {c.descricao && <span className="italic">{c.descricao}</span>}
        </div>
      </div>

      <div className="col-start-2 flex items-center justify-between gap-2 sm:col-start-auto sm:flex-col sm:items-end sm:justify-start sm:gap-1">
        <span className="font-bold tabular-nums">{centavosParaReais(c.valorCentavos)}</span>
        <div className="flex items-center gap-1">
          {paga ? (
            <Button variant="ghost" size="sm" title="Voltar para em aberto" disabled={pending} onClick={onDesfazer}>
              <Undo2 className="size-3.5" />
              Desfazer
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" disabled={pending} onClick={onPagar}>
                <Check className="size-3.5" />
                Paga
              </Button>
              <Button variant="ghost" size="icon-sm" title="Editar" disabled={pending} onClick={onEditar}>
                <Pencil className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon-sm" title={c.repeteTodoMes ? "Tirar este mês" : "Excluir"} disabled={pending} onClick={onExcluir}>
                <X className="size-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Totais({ titulo, linhas }: { titulo: string; linhas: { nome: string; quantidade: number; totalCentavos: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y text-sm">
          {linhas.map((l) => (
            <div key={l.nome} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 break-words">
                {l.nome} <span className="text-xs text-muted-foreground">({l.quantidade})</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{centavosParaReais(l.totalCentavos)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
