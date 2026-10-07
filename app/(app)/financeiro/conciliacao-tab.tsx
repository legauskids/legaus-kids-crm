"use client";

import { useActionState, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { centavosParaReais } from "@/lib/utils/money";
import { ROTULO_ORIGEM, centroDoSeletor, type OrigemDespesa } from "@/lib/utils/despesas";
import { ArrowLeftRight, Check, Split, Undo2, Upload, X } from "lucide-react";
import {
  importarExtratoAction,
  confirmarParAction,
  rejeitarParAction,
  classificarSaidaAction,
  classificarEntradaAction,
  ignorarTransacaoAction,
  reabrirTransacaoAction,
  type AcaoConciliacaoState,
  type AcaoImportarExtratoState,
} from "@/app/(app)/financeiro/actions";
import { RateioDialog, type CategoriaRateioVM, type ProjetoSeletorVM, type RateioVM } from "@/app/(app)/financeiro/rateio-dialog";
import { SeletorCentroDespesa, type CentroGeralVM } from "@/app/(app)/financeiro/despesa-dialog";

export type DespesaParVM = {
  id: string;
  dia: string;
  valorCentavos: number;
  fornecedor: string;
  origem: OrigemDespesa;
  categoriaNome: string | null;
  centroNome: string | null;
  ehProjeto: boolean;
};

export type CandidatoVM = { despesa: DespesaParVM; motivo: string };

type LinhaBase = { id: string; dia: string; descricao: string; valorCentavos: number; tipo: "ENTRADA" | "SAIDA"; rateios: RateioVM[] };

export type LinhaPendenteVM = LinhaBase & {
  /** Despesas aguardando com o mesmo valor e data a até 3 dias, já ordenadas (ver pares-despesa.ts). */
  candidatos: CandidatoVM[];
  sugestaoCategoriaId: string | null;
  sugestaoNegocioId: string | null;
  fornecedorSugerido: string;
};

export type LinhaResolvidaVM = LinhaBase & { status: "CONCILIADA" | "IGNORADA"; despesa: DespesaParVM | null };

export type ImportacaoVM = {
  id: string;
  nomeArquivo: string;
  importadoEm: string;
  importadoPorNome: string;
  quantidadeTransacoes: number;
  naoConciliadas: number;
};

const initialState: AcaoImportarExtratoState = {};

function diaCurto(dia: string) {
  const [, mes, d] = dia.split("-");
  return `${d}/${mes}`;
}

function Valor({ centavos, tipo, className }: { centavos: number; tipo: "ENTRADA" | "SAIDA"; className?: string }) {
  return (
    <span className={cn("font-bold tabular-nums", tipo === "ENTRADA" ? "text-success" : "text-destructive", className)}>
      {tipo === "ENTRADA" ? "+" : "-"}
      {centavosParaReais(centavos)}
    </span>
  );
}

/** Roda uma ação da conciliação com toast de erro e atualiza a tela. */
function useAcao() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function executar(acao: () => Promise<AcaoConciliacaoState>, sucesso?: string, depois?: () => void) {
    startTransition(async () => {
      const r = await acao();
      if (r.error) {
        toast.error(r.error);
        return;
      }
      if (sucesso) toast.success(sucesso);
      depois?.();
      router.refresh();
    });
  }
  return { pending, executar };
}

/**
 * Conciliação do extrato. Pra cada saída, procura a despesa já registrada
 * (mesmo valor, até 3 dias) e mostra o par lado a lado; saída sem despesa é
 * classificada na hora; entrada vai pro negócio ou pra um centro geral.
 * Nada é conciliado sem confirmação, e tudo pode ser desfeito.
 */
export function ConciliacaoTab({
  pendentes,
  resolvidos,
  resolvidosTodos,
  importacoes,
  categorias,
  centrosGerais,
  projetos,
}: {
  pendentes: LinhaPendenteVM[];
  resolvidos: LinhaResolvidaVM[];
  resolvidosTodos: boolean;
  importacoes: ImportacaoVM[];
  categorias: CategoriaRateioVM[];
  centrosGerais: CentroGeralVM[];
  projetos: ProjetoSeletorVM[];
}) {
  const [state, formAction, pendingImportacao] = useActionState(importarExtratoAction, initialState);
  const [dividindo, setDividindo] = useState<LinhaBase | null>(null);

  const semRateio = (l: LinhaPendenteVM) => l.rateios.length === 0;
  const pares = pendentes.filter((l) => l.tipo === "SAIDA" && semRateio(l) && l.candidatos.length > 0);
  const semPar = pendentes.filter((l) => l.tipo === "SAIDA" && !(semRateio(l) && l.candidatos.length > 0));
  const entradas = pendentes.filter((l) => l.tipo === "ENTRADA");

  return (
    <div className="flex-1 space-y-5 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Importar extrato (OFX)</CardTitle>
          <p className="text-xs text-muted-foreground">
            Pra cada saída do extrato, o sistema procura uma despesa já registrada com o mesmo valor e data próxima. Nada é conciliado sem a sua
            confirmação.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action={formAction} className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              name="arquivo"
              accept=".ofx,.OFX"
              required
              className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
            />
            <Button type="submit" size="sm" disabled={pendingImportacao}>
              <Upload className="mr-1.5 size-3.5" />
              Importar
            </Button>
          </form>
          {state.success && (
            <p className="rounded-md bg-success/10 px-3 py-2 text-xs font-medium text-success">
              {state.success.novasImportadas > 0
                ? `${state.success.novasImportadas} lançamento(s) importado(s)`
                : "Nenhum lançamento novo: esse extrato já tinha sido importado"}
              {state.success.duplicadasIgnoradas > 0 && ` — ${state.success.duplicadasIgnoradas} já estava(m) no sistema e não foi(ram) duplicado(s)`}.
              {state.success.paresProvaveis > 0 && ` ${state.success.paresProvaveis} saída(s) com despesa registrada pra confirmar.`}
              {state.success.entradasComSugestao > 0 && ` ${state.success.entradasComSugestao} entrada(s) com negócio sugerido.`}
            </p>
          )}
          {state.error && <p className="text-xs text-destructive">{state.error}</p>}

          {importacoes.length > 0 && (
            <details className="border-t pt-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none font-medium">Importações anteriores ({importacoes.length})</summary>
              <div className="mt-1 space-y-1">
                {importacoes.map((i) => (
                  <div key={i.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {i.nomeArquivo} — {new Date(i.importadoEm).toLocaleString("pt-BR")} por {i.importadoPorNome}
                    </span>
                    <span>
                      {i.quantidadeTransacoes} transação(ões){i.naoConciliadas > 0 && `, ${i.naoConciliadas} pendente(s)`}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Contador valor={pares.length} rotulo="prováveis pares para confirmar" className="text-warning" />
        <Contador valor={semPar.length} rotulo="saídas sem despesa registrada" className="text-destructive" />
        <Contador valor={entradas.length} rotulo="entradas para classificar" />
        <Contador valor={resolvidos.length} rotulo={resolvidosTodos ? "lançamentos resolvidos" : "resolvidos nos últimos 90 dias"} className="text-success" />
      </div>

      {pendentes.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhum lançamento pendente. Importe o OFX do Sicredi aqui ou mande o arquivo no WhatsApp.
          </CardContent>
        </Card>
      )}

      {pares.length > 0 && (
        <Secao titulo="Prováveis pares" texto="A despesa registrada e a linha do extrato viram um lançamento só quando você confirma. Nenhuma despesa nova é criada.">
          {pares.map((l) => (
            <CardPar key={l.id} linha={l} />
          ))}
        </Secao>
      )}

      {semPar.length > 0 && (
        <Secao
          titulo="Saídas sem despesa registrada"
          texto="Gastos que não chegaram por áudio, comprovante nem lançamento manual. Classifique agora ou ignore, se for transferência entre contas."
        >
          {semPar.map((l) => (
            <LinhaSaida
              key={l.id}
              linha={l}
              categorias={categorias.filter((c) => c.tipo === "DESPESA")}
              centrosGerais={centrosGerais}
              projetos={projetos}
              onDividir={() => setDividindo(l)}
            />
          ))}
        </Secao>
      )}

      {entradas.length > 0 && (
        <Secao titulo="Entradas" texto="Vincule cada recebimento ao negócio de origem ou a um centro geral. ★ = negócio com o mesmo valor.">
          {entradas.map((l) => (
            <LinhaEntrada key={l.id} linha={l} centrosGerais={centrosGerais} projetos={projetos} onDividir={() => setDividindo(l)} />
          ))}
        </Secao>
      )}

      <Secao
        titulo="Resolvidos"
        texto={resolvidosTodos ? "Todos os lançamentos já resolvidos." : "Lançamentos dos últimos 90 dias já resolvidos."}
        acao={
          <Link href={resolvidosTodos ? "/financeiro?aba=conciliacao" : "/financeiro?aba=conciliacao&resolvidos=todos"} className="text-xs text-primary hover:underline">
            {resolvidosTodos ? "Só os últimos 90 dias" : "Ver todos"}
          </Link>
        }
      >
        {resolvidos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada resolvido nesse período.</p>
        ) : (
          <div className="divide-y rounded-lg border px-3">
            {resolvidos.map((l) => (
              <LinhaResolvida key={l.id} linha={l} onDividir={() => setDividindo(l)} />
            ))}
          </div>
        )}
      </Secao>

      {dividindo && (
        <RateioDialog
          key={dividindo.id}
          open
          onOpenChange={(aberto) => !aberto && setDividindo(null)}
          transacao={dividindo}
          projetos={projetos}
          categorias={categorias}
          centrosGerais={centrosGerais}
        />
      )}
    </div>
  );
}

function Contador({ valor, rotulo, className }: { valor: number; rotulo: string; className?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className={cn("text-2xl font-bold tabular-nums", className)}>{valor}</p>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
    </div>
  );
}

function Secao({ titulo, texto, acao, children }: { titulo: string; texto: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{titulo}</h2>
          <p className="text-xs text-muted-foreground">{texto}</p>
        </div>
        {acao}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function CardPar({ linha }: { linha: LinhaPendenteVM }) {
  const { pending, executar } = useAcao();
  const [escolhidaId, setEscolhidaId] = useState(linha.candidatos[0].despesa.id);
  const candidato = linha.candidatos.find((c) => c.despesa.id === escolhidaId) ?? linha.candidatos[0];
  const d = candidato.despesa;

  return (
    <div className="rounded-xl border bg-card">
      <div className="grid gap-3 p-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Extrato Sicredi, {diaCurto(linha.dia)}</p>
          <p className="truncate font-medium">{linha.descricao}</p>
          <Valor centavos={linha.valorCentavos} tipo={linha.tipo} />
        </div>
        <ArrowLeftRight className="mx-auto size-4 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            Despesa registrada, {diaCurto(d.dia)} ({ROTULO_ORIGEM[d.origem].toLowerCase()})
          </p>
          <p className="truncate font-medium">{d.fornecedor}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>{d.categoriaNome ?? "Sem categoria"}</span>
            <span className={cn("rounded-md px-1.5 py-0.5", d.ehProjeto ? "bg-primary/10 font-medium text-primary" : "border bg-muted/50")}>
              {d.centroNome ?? "Sem centro"}
            </span>
          </div>
          <span className="font-bold tabular-nums">{centavosParaReais(d.valorCentavos)}</span>
          {linha.candidatos.length > 1 && (
            <select
              value={escolhidaId}
              onChange={(e) => setEscolhidaId(e.target.value)}
              className="mt-1 block h-8 w-full rounded-md border bg-background px-2 text-xs"
            >
              {linha.candidatos.map((c) => (
                <option key={c.despesa.id} value={c.despesa.id}>
                  {c.despesa.fornecedor} ({diaCurto(c.despesa.dia)})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">{candidato.motivo}</span>
        <div className="flex gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => executar(() => rejeitarParAction(linha.id, d.id), undefined, () => setEscolhidaId(linha.candidatos.find((c) => c.despesa.id !== d.id)?.despesa.id ?? d.id))}
          >
            Não é esse
          </Button>
          <Button size="sm" disabled={pending} onClick={() => executar(() => confirmarParAction(linha.id, d.id), "Par confirmado.")}>
            <Check className="size-3.5" />
            Confirmar par
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChipsRateio({ linha }: { linha: LinhaBase }) {
  const classificado = linha.rateios.reduce((s, r) => s + r.valorCentavos, 0);
  const falta = linha.valorCentavos - classificado;
  if (linha.rateios.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {linha.rateios.map((r) => (
        <span key={r.id} className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", r.negocioId ? "bg-primary/10 text-primary" : "bg-muted text-foreground")}>
          {r.negocioId ? `Projeto: ${r.negocioTitulo}` : [r.centroCustoNome, r.centroGeralNome].filter(Boolean).join(" · ")}
          {linha.rateios.length > 1 || falta > 0 ? ` · ${centavosParaReais(r.valorCentavos)}` : ""}
        </span>
      ))}
      {falta > 0 && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">Falta {centavosParaReais(falta)}</span>}
    </div>
  );
}

function LinhaSaida({
  linha,
  categorias,
  centrosGerais,
  projetos,
  onDividir,
}: {
  linha: LinhaPendenteVM;
  categorias: CategoriaRateioVM[];
  centrosGerais: CentroGeralVM[];
  projetos: ProjetoSeletorVM[];
  onDividir: () => void;
}) {
  const { pending, executar } = useAcao();
  const sugerida = categorias.find((c) => c.id === linha.sugestaoCategoriaId);
  const [aberto, setAberto] = useState(false);
  const [fornecedor, setFornecedor] = useState(linha.fornecedorSugerido);
  const [categoriaId, setCategoriaId] = useState(sugerida?.id ?? "");
  const [centro, setCentro] = useState(sugerida?.centroGeralPadraoId ? `g:${sugerida.centroGeralPadraoId}` : "");
  const parcial = linha.rateios.length > 0;

  function escolherCategoria(id: string) {
    setCategoriaId(id);
    const padrao = categorias.find((c) => c.id === id)?.centroGeralPadraoId;
    if (!centro && padrao) setCentro(`g:${padrao}`);
  }

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{linha.descricao}</p>
          <p className="text-xs text-muted-foreground">{diaCurto(linha.dia)}</p>
          <ChipsRateio linha={linha} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Valor centavos={linha.valorCentavos} tipo={linha.tipo} />
          {parcial ? (
            <>
              <Button variant="outline" size="sm" onClick={onDividir}>
                <Split className="size-3.5" />
                Editar divisão
              </Button>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => executar(() => reabrirTransacaoAction(linha.id))}>
                <Undo2 className="size-3.5" />
                Desfazer
              </Button>
            </>
          ) : (
            !aberto && (
              <>
                <Button variant="outline" size="sm" disabled={pending} onClick={() => executar(() => ignorarTransacaoAction(linha.id))}>
                  Ignorar
                </Button>
                <Button variant="outline" size="sm" title="Dividir entre projetos e categorias" onClick={onDividir}>
                  <Split className="size-3.5" />
                </Button>
                <Button size="sm" onClick={() => setAberto(true)}>
                  Classificar
                </Button>
              </>
            )
          )}
        </div>
      </div>
      {aberto && (
        <div className="mt-3 grid gap-2 border-t pt-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Fornecedor
            <Input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} className="h-9 text-foreground" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Categoria
            <select value={categoriaId} onChange={(e) => escolherCategoria(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground">
              <option value="">Escolha...</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Centro de custo
            <SeletorCentroDespesa valor={centro} onChange={setCentro} centrosGerais={centrosGerais} projetos={projetos} className="text-foreground" />
          </label>
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setAberto(false)}>
              <X className="size-3.5" />
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                executar(
                  () => classificarSaidaAction(linha.id, { fornecedor, categoriaId: categoriaId || null, ...centroDoSeletor(centro) }),
                  "Saída classificada.",
                )
              }
            >
              Salvar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function LinhaEntrada({
  linha,
  centrosGerais,
  projetos,
  onDividir,
}: {
  linha: LinhaPendenteVM;
  centrosGerais: CentroGeralVM[];
  projetos: ProjetoSeletorVM[];
  onDividir: () => void;
}) {
  const { pending, executar } = useAcao();
  const [destino, setDestino] = useState(linha.sugestaoNegocioId ? `n:${linha.sugestaoNegocioId}` : "");
  const ordenados = [...projetos].sort((a, b) => Number(b.valorCentavos === linha.valorCentavos) - Number(a.valorCentavos === linha.valorCentavos));
  const parcial = linha.rateios.length > 0;

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{linha.descricao}</p>
          <p className="text-xs text-muted-foreground">{diaCurto(linha.dia)}</p>
          <ChipsRateio linha={linha} />
        </div>
        <Valor centavos={linha.valorCentavos} tipo={linha.tipo} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {parcial ? (
          <>
            <Button variant="outline" size="sm" onClick={onDividir}>
              <Split className="size-3.5" />
              Editar divisão
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => executar(() => reabrirTransacaoAction(linha.id))}>
              <Undo2 className="size-3.5" />
              Desfazer
            </Button>
          </>
        ) : (
          <>
            <select value={destino} onChange={(e) => setDestino(e.target.value)} className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm">
              <option value="">Origem do recebimento...</option>
              <optgroup label="Negócios">
                {ordenados.map((n) => (
                  <option key={n.id} value={`n:${n.id}`}>
                    {n.valorCentavos === linha.valorCentavos ? "★ " : ""}
                    {n.titulo}
                    {n.contatoNome ? ` — ${n.contatoNome}` : ""} ({centavosParaReais(n.valorCentavos)})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Centros gerais">
                {centrosGerais.map((c) => (
                  <option key={c.id} value={`g:${c.id}`}>
                    {c.nome}
                  </option>
                ))}
              </optgroup>
            </select>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => executar(() => ignorarTransacaoAction(linha.id))}>
              Ignorar
            </Button>
            <Button variant="outline" size="sm" title="Dividir entre projetos e categorias" onClick={onDividir}>
              <Split className="size-3.5" />
            </Button>
            <Button
              size="sm"
              disabled={pending || !destino}
              onClick={() => executar(() => classificarEntradaAction(linha.id, centroDoSeletor(destino)), "Entrada vinculada.")}
            >
              Salvar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function LinhaResolvida({ linha, onDividir }: { linha: LinhaResolvidaVM; onDividir: () => void }) {
  const { pending, executar } = useAcao();
  const d = linha.despesa;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate">
          <span className="font-semibold">{diaCurto(linha.dia)}</span> {linha.descricao}
        </p>
        {linha.status === "IGNORADA" ? (
          <p className="text-xs text-muted-foreground">Ignorado</p>
        ) : d ? (
          <p className="text-xs text-muted-foreground">
            {d.fornecedor} · {d.categoriaNome ?? "Sem categoria"} · {d.centroNome ?? "Sem centro"}
            {d.origem === "EXTRATO" ? " (classificado no extrato)" : ` (despesa por ${ROTULO_ORIGEM[d.origem].toLowerCase()})`}
          </p>
        ) : (
          <ChipsRateio linha={linha} />
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Valor centavos={linha.valorCentavos} tipo={linha.tipo} className="text-sm" />
        {linha.status === "CONCILIADA" && !d && (
          <Button variant="ghost" size="icon-sm" title="Editar a divisão" onClick={onDividir}>
            <Split className="size-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          title={d && d.origem !== "EXTRATO" ? "A despesa volta para aguardando conciliação" : "O lançamento volta a ficar pendente"}
          onClick={() => executar(() => reabrirTransacaoAction(linha.id), d && d.origem !== "EXTRATO" ? "Desfeito — a despesa voltou a aguardar." : "Desfeito.")}
        >
          <Undo2 className="size-3.5" />
          Desfazer
        </Button>
      </div>
    </div>
  );
}
