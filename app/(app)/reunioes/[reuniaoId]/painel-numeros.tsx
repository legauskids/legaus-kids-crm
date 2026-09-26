import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { centavosParaReais } from "@/lib/utils/money";
import type { NegocioNoResumo, ResumoReuniao, SinalAtencao } from "@/lib/utils/reuniao";
import { AlertTriangle, ArrowUpRight, History, Info, Telescope, Timer } from "lucide-react";

// Números da reunião em três colunas — o período que passou, a foto de
// agora e a perspectiva do próximo — cada um clicável pro painel certo,
// pra abrir e analisar a fundo sem sair da reunião.

type Tom = "bom" | "ruim" | "alerta" | undefined;

function qtdValor(qtd: number, valorCentavos: number): string {
  return valorCentavos > 0 ? `${qtd} · ${centavosParaReais(valorCentavos)}` : String(qtd);
}

function Indicador({
  rotulo,
  valor,
  sub,
  href,
  tom,
  itens,
  rotuloItens = "negócios",
  progresso,
}: {
  rotulo: string;
  valor: string;
  sub?: string | null;
  href: string;
  tom?: Tom;
  itens?: NegocioNoResumo[];
  rotuloItens?: string;
  /** 0-100, barra fina embaixo do valor */
  progresso?: { atingido: number; referencia?: number };
}) {
  return (
    <div className="rounded-xl border bg-card shadow-xs">
      <Link href={href} className="group block rounded-xl px-3.5 py-3 transition-colors hover:bg-muted/60">
        <p className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
          {rotulo}
          <ArrowUpRight className="size-3.5 shrink-0 opacity-40 transition-opacity group-hover:opacity-100" />
        </p>
        <p
          className={cn(
            "mt-0.5 text-lg font-bold tracking-tight text-foreground",
            tom === "bom" && "text-emerald-600",
            tom === "ruim" && "text-red-600",
            tom === "alerta" && "text-amber-600",
          )}
        >
          {valor}
        </p>
        {sub && <p className="text-xs leading-snug text-muted-foreground">{sub}</p>}
        {progresso && (
          <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(progresso.atingido, 100)}%` }} />
            {progresso.referencia !== undefined && (
              <div className="absolute inset-y-0 w-0.5 bg-foreground/60" style={{ left: `${Math.min(progresso.referencia, 100)}%` }} title="Quanto do mês já passou" />
            )}
          </div>
        )}
      </Link>
      {itens && itens.length > 0 && (
        <details className="border-t px-3.5 py-2 text-xs">
          <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
            Ver {itens.length} {rotuloItens}
          </summary>
          <ul className="mt-1.5 space-y-0.5">
            {itens.map((n) => (
              <li key={n.id}>
                <Link href={`/negocios/${n.id}`} className="flex items-start justify-between gap-2 rounded px-1 py-1 hover:bg-muted">
                  <span className="min-w-0">
                    <span className="font-medium text-foreground">{n.titulo}</span>
                    {(n.contatoNome || n.detalhe) && (
                      <span className="block text-muted-foreground">{[n.contatoNome, n.detalhe].filter(Boolean).join(" · ")}</span>
                    )}
                  </span>
                  {n.valorCentavos > 0 && <span className="shrink-0 font-medium">{centavosParaReais(n.valorCentavos)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Coluna({ icone: Icone, titulo, subtitulo, children }: { icone: typeof History; titulo: string; subtitulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2 px-0.5">
        <Icone className="size-4 text-primary" />
        <div className="leading-tight">
          <h3 className="text-sm font-semibold">{titulo}</h3>
          <p className="text-xs text-muted-foreground">{subtitulo}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function SinaisAtencao({ sinais }: { sinais: SinalAtencao[] }) {
  if (sinais.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
        Nada fora do lugar pelos números do CRM — bom sinal. Use a reunião pra olhar a perspectiva e os próximos passos.
      </div>
    );
  }
  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs">
      <h3 className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle className="size-4 text-amber-600" />
        O que precisa de atenção
        <span className="text-xs font-normal text-muted-foreground">— levantado pelo CRM, do mais urgente pro informativo</span>
      </h3>
      <div className="grid gap-2 md:grid-cols-2">
        {sinais.map((s) => (
          <Link
            key={s.chave}
            href={s.href}
            className={cn(
              "group flex gap-2.5 rounded-lg border-l-4 bg-muted/40 px-3 py-2 transition-colors hover:bg-muted",
              s.nivel === "alta" && "border-l-red-500",
              s.nivel === "media" && "border-l-amber-500",
              s.nivel === "info" && "border-l-sky-500",
            )}
          >
            {s.nivel === "info" ? <Info className="mt-0.5 size-4 shrink-0 text-sky-600" /> : null}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium leading-snug">{s.titulo}</span>
              {s.detalhe && <span className="block text-xs text-muted-foreground">{s.detalhe}</span>}
            </span>
            <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 opacity-40 group-hover:opacity-100" />
          </Link>
        ))}
      </div>
    </div>
  );
}

export function PainelNumeros({ resumo, fotoDoEncerramento }: { resumo: ResumoReuniao; fotoDoEncerramento?: string | null }) {
  const { links, vendas, pipeline, financeiro, posVenda, tarefas, compromissos, perspectiva, meta } = resumo;
  const etapasTexto = (etapas: ResumoReuniao["pipeline"]["etapas"]) =>
    etapas.filter((e) => e.qtd > 0).map((e) => `${e.nome} ${e.qtd}`).join(" · ") || "vazio";

  return (
    <div className="space-y-3">
      {fotoDoEncerramento && (
        <p className="text-xs text-muted-foreground">
          Números congelados no encerramento ({fotoDoEncerramento}) — o que foi visto na reunião. Os links abrem os painéis com os dados de hoje.
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-3">
        <Coluna icone={History} titulo="Resumo do período" subtitulo={resumo.periodo.rotulo}>
          <Indicador
            rotulo="Vendas ganhas"
            valor={qtdValor(vendas.ganhos.qtd, vendas.ganhos.valorCentavos)}
            tom={vendas.ganhos.qtd > 0 ? "bom" : undefined}
            href={links.funilVenda}
            itens={vendas.ganhos.itens}
          />
          <Indicador
            rotulo="Negócios perdidos"
            valor={qtdValor(vendas.perdidos.qtd, vendas.perdidos.valorCentavos)}
            tom={vendas.perdidos.qtd > 0 ? "ruim" : undefined}
            href={links.funilVenda}
            itens={vendas.perdidos.itens}
          />
          <Indicador
            rotulo="Leads"
            valor={`${vendas.leads.conversasNovas} ${vendas.leads.conversasNovas === 1 ? "conversa nova" : "conversas novas"}`}
            sub={`${vendas.leads.contatosNovos} contatos cadastrados · ${vendas.novosNegocios.qtd} negócios novos${vendas.novosNegocios.valorCentavos > 0 ? ` (${centavosParaReais(vendas.novosNegocios.valorCentavos)})` : ""}`}
            href={links.atendimento}
          />
          <Indicador
            rotulo="Resultado de caixa"
            valor={centavosParaReais(financeiro.resultadoCentavos)}
            tom={financeiro.resultadoCentavos < 0 ? "ruim" : financeiro.resultadoCentavos > 0 ? "bom" : undefined}
            sub={`Entradas ${centavosParaReais(financeiro.entradasCentavos)} · saídas ${centavosParaReais(financeiro.saidasCentavos)}`}
            href={links.financeiro}
          />
          <Indicador
            rotulo="Execução"
            valor={`${tarefas.concluidasNoPeriodo} ${tarefas.concluidasNoPeriodo === 1 ? "tarefa concluída" : "tarefas concluídas"}`}
            sub={`${compromissos.concluidosNoPeriodo} compromissos de reunião cumpridos`}
            href="/tarefas"
          />
          {meta && (
            <Indicador
              rotulo={`Meta de ${meta.rotuloMes}`}
              valor={`${meta.percentualAtingido}%`}
              tom={meta.percentualAtingido >= meta.percentualDoMes ? "bom" : meta.percentualAtingido < meta.percentualDoMes - 10 ? "ruim" : "alerta"}
              sub={`${centavosParaReais(meta.ganhoCentavos)} de ${centavosParaReais(meta.alvoCentavos)} · ${meta.percentualDoMes}% do mês passou`}
              href={links.dashboard}
              progresso={{ atingido: meta.percentualAtingido, referencia: meta.percentualDoMes }}
            />
          )}
        </Coluna>

        <Coluna icone={Timer} titulo="Situação agora" subtitulo="foto do funil, das tarefas e do caixa">
          <Indicador
            rotulo="Em fechamento"
            valor={qtdValor(pipeline.emFechamento.qtd, pipeline.emFechamento.valorCentavos)}
            href={links.funilVenda}
            itens={pipeline.emFechamento.itens}
          />
          <Indicador
            rotulo="Funil de venda em aberto"
            valor={qtdValor(pipeline.emNegociacao.qtd, pipeline.emNegociacao.valorCentavos)}
            sub={etapasTexto(pipeline.etapas)}
            href={links.funilVenda}
          />
          <Indicador
            rotulo="Negócios parados além do prazo"
            valor={qtdValor(pipeline.parados.qtd, pipeline.parados.valorCentavos)}
            tom={pipeline.parados.qtd > 0 ? "ruim" : undefined}
            href={links.parados}
            itens={pipeline.parados.itens}
          />
          <Indicador
            rotulo="Pós-venda · em pagamento"
            valor={qtdValor(posVenda.emPagamento.qtd, posVenda.emPagamento.valorCentavos)}
            sub={etapasTexto(posVenda.etapas)}
            href={links.funilPosVenda}
          />
          <div className="grid grid-cols-2 gap-2.5">
            <Indicador rotulo="Tarefas atrasadas" valor={String(tarefas.atrasadas)} tom={tarefas.atrasadas > 0 ? "ruim" : undefined} href={links.tarefasAtrasadas} />
            <Indicador rotulo="Aguardando aprovação" valor={String(tarefas.aprovacoesPendentes)} tom={tarefas.aprovacoesPendentes > 0 ? "alerta" : undefined} href={links.aprovacoes} />
          </div>
          <Indicador
            rotulo="Extrato a classificar"
            valor={`${financeiro.aClassificarQtd} ${financeiro.aClassificarQtd === 1 ? "lançamento" : "lançamentos"}`}
            tom={financeiro.aClassificarQtd > 0 ? "alerta" : undefined}
            sub={
              financeiro.aClassificarQtd > 0
                ? `${centavosParaReais(financeiro.aClassificarCentavos)} sem projeto ou centro de custo no período`
                : "tudo classificado no período"
            }
            href={links.conciliacao}
          />
        </Coluna>

        <Coluna icone={Telescope} titulo="Perspectiva" subtitulo={resumo.proximo.rotulo}>
          <Indicador
            rotulo="Fechamentos previstos"
            valor={qtdValor(perspectiva.fechamentosPrevistos.qtd, perspectiva.fechamentosPrevistos.valorCentavos)}
            tom={perspectiva.fechamentosPrevistos.qtd > 0 ? "bom" : undefined}
            href={links.funilVenda}
            itens={perspectiva.fechamentosPrevistos.itens}
          />
          <Indicador
            rotulo="Em fechamento sem data prevista"
            valor={String(perspectiva.emFechamentoSemPrevisao)}
            tom={perspectiva.emFechamentoSemPrevisao > 0 ? "alerta" : undefined}
            sub="defina a previsão de fechamento no negócio pra entrar na perspectiva"
            href={links.funilVenda}
          />
          {pipeline.previsaoVencida.qtd > 0 && (
            <Indicador
              rotulo="Previsão de fechamento vencida"
              valor={qtdValor(pipeline.previsaoVencida.qtd, pipeline.previsaoVencida.valorCentavos)}
              tom="alerta"
              sub="atualize a data ou o status do negócio"
              href={links.funilVenda}
              itens={pipeline.previsaoVencida.itens}
            />
          )}
          <Indicador
            rotulo="Instalações"
            valor={String(perspectiva.instalacoes.qtd)}
            href={links.producao}
            itens={perspectiva.instalacoes.itens}
            rotuloItens="instalações"
          />
          <Indicador
            rotulo="Produção com entrega prevista"
            valor={String(perspectiva.producaoPrevista.qtd)}
            href={links.producao}
            itens={perspectiva.producaoPrevista.itens}
          />
          <div className="grid grid-cols-2 gap-2.5">
            <Indicador rotulo="Tarefas com prazo" valor={String(perspectiva.tarefasComPrazo)} href="/tarefas" />
            <Indicador rotulo="Compromissos vencendo" valor={String(perspectiva.compromissosVencendo)} href="#compromissos" />
          </div>
          {perspectiva.metaProximoMesCentavos !== null && (
            <Indicador rotulo="Meta do próximo mês" valor={centavosParaReais(perspectiva.metaProximoMesCentavos)} href={links.dashboard} />
          )}
        </Coluna>
      </div>
    </div>
  );
}
