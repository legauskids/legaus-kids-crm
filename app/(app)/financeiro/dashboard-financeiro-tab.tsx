import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { centavosParaReais } from "@/lib/utils/money";
import { corDoIndice } from "@/lib/utils/colors";
import { ArrowDownCircle, ArrowUpCircle, ChevronLeft, ChevronRight, Info, Percent, Scale, Tags, TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { getDashboardFinanceiro, PeriodoFinanceiro } from "@/lib/server/resultado-financeiro";

type Dados = Awaited<ReturnType<typeof getDashboardFinanceiro>>;

const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return Math.round(((atual - anterior) / Math.abs(anterior)) * 100);
}

function reaisCompacto(centavos: number): string {
  const reais = centavos / 100;
  if (Math.abs(reais) >= 1000) return `${(reais / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return reais.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/**
 * Dashboard financeiro — resultado de CAIXA dos extratos importados, com o
 * rateio por projeto e centro de custo. Modelo inspirado em Omie/Conta
 * Azul/Flowup: KPIs com comparação, fluxo mensal, DRE gerencial, despesas
 * por centro de custo e margem por projeto — tudo clicável até o detalhe.
 */
export function DashboardFinanceiroTab({ periodo, dados }: { periodo: PeriodoFinanceiro; dados: Dados }) {
  const { atual, anterior } = dados;
  const hrefPeriodo = (param: string) => `/financeiro?aba=dashboard&${param}`;
  const mesAtualChave = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
  const aClassificarTotal = atual.aClassificar.entradasCentavos + atual.aClassificar.saidasCentavos;

  return (
    <div className="flex-1 space-y-5 p-6">
      {/* Período */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link
            href={hrefPeriodo(periodo.tipo === "ano" ? `ano=${periodo.anterior.chave}` : `mes=${periodo.anterior.chave}`)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            title={`Ver ${periodo.anterior.rotulo}`}
          >
            <ChevronLeft className="size-4" />
          </Link>
          <h2 className="min-w-44 text-center text-base font-semibold capitalize text-foreground">{periodo.rotulo}</h2>
          <Link
            href={hrefPeriodo(periodo.tipo === "ano" ? `ano=${periodo.proximaChave}` : `mes=${periodo.proximaChave}`)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            title="Próximo"
          >
            <ChevronRight className="size-4" />
          </Link>
        </div>
        <div className="flex gap-1">
          <Link
            href={hrefPeriodo(`mes=${periodo.tipo === "ano" ? `${periodo.chave}-${mesAtualChave.slice(5)}` : periodo.chave}`)}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium", periodo.tipo === "mes" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
          >
            Mês
          </Link>
          <Link
            href={hrefPeriodo(`ano=${periodo.chave.slice(0, 4)}`)}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium", periodo.tipo === "ano" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
          >
            Ano
          </Link>
        </div>
      </div>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Regime de caixa: só o que entrou e saiu nos extratos importados
          {dados.cobertura.ultimoLancamento && ` — último lançamento em ${dados.cobertura.ultimoLancamento.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`}.
          {" "}Importe o extrato mais recente em{" "}
          <Link href="/financeiro?aba=conciliacao" className="font-medium text-primary hover:underline">
            Conciliação bancária
          </Link>
          {" "}pra manter os números em dia. Lançamentos ignorados (ex.: transferência entre contas) não entram.
        </span>
      </p>

      <Kpis
        itens={[
          { label: "Entradas", valor: atual.entradasCentavos, anterior: anterior.entradasCentavos, icon: ArrowUpCircle, corIndice: 1, href: "/financeiro?aba=conciliacao&filtroTransacao=TODAS" },
          { label: "Saídas", valor: atual.saidasCentavos, anterior: anterior.saidasCentavos, icon: ArrowDownCircle, corIndice: 5, href: "/financeiro?aba=conciliacao&filtroTransacao=TODAS", inverterCor: true },
          { label: "Resultado", valor: atual.resultadoCentavos, anterior: anterior.resultadoCentavos, icon: Scale, corIndice: 0, destaque: true },
          {
            label: "Margem",
            texto: atual.margemPercentual === null ? "—" : `${atual.margemPercentual.toLocaleString("pt-BR")}%`,
            sub: anterior.margemPercentual === null ? "sem comparação" : `era ${anterior.margemPercentual.toLocaleString("pt-BR")}% em ${periodo.anterior.rotulo}`,
            icon: Percent,
            corIndice: 2,
          },
          {
            label: "A classificar",
            valor: aClassificarTotal,
            sub: `${atual.aClassificar.lancamentos} lançamento(s) sem projeto/centro de custo`,
            icon: Tags,
            corIndice: 4,
            alerta: aClassificarTotal > 0,
            href: "/financeiro?aba=conciliacao&filtroTransacao=NAO_CONCILIADA",
          },
        ]}
        rotuloAnterior={periodo.anterior.rotulo}
      />

      <div className="grid gap-5 lg:grid-cols-5">
        <FluxoMensal serie={dados.serie} className="lg:col-span-3" chaveSelecionada={periodo.tipo === "mes" ? periodo.chave : null} />
        <Dre dados={atual} className="lg:col-span-2" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Centros titulo="Despesas por centro de custo" linhas={atual.despesasPorCentro} total={atual.saidasCentavos} vazio="Nenhuma saída classificada em centro de custo nesse período." cor="bg-destructive/70" />
        <Centros titulo="Outras receitas por centro de custo" linhas={atual.receitasPorCentro} total={atual.entradasCentavos} vazio="Nenhuma entrada classificada em centro de custo nesse período." cor="bg-success/70" />
      </div>

      <Projetos projetos={dados.projetos} />
    </div>
  );
}

type ItemKpi = {
  label: string;
  valor?: number;
  anterior?: number;
  texto?: string;
  sub?: string;
  icon: LucideIcon;
  corIndice: number;
  href?: string;
  alerta?: boolean;
  destaque?: boolean;
  /** Pra saídas: subir é ruim (vermelho), cair é bom. */
  inverterCor?: boolean;
};

function Kpis({ itens, rotuloAnterior }: { itens: ItemKpi[]; rotuloAnterior: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {itens.map((item) => {
        const Icon = item.icon;
        const cor = corDoIndice(item.corIndice);
        const v = item.valor !== undefined && item.anterior !== undefined ? variacao(item.valor, item.anterior) : null;
        const IconeVar = v === null ? Minus : v >= 0 ? TrendingUp : TrendingDown;
        const bom = v === null ? null : item.inverterCor ? v <= 0 : v >= 0;
        const conteudo = (
          <Card className={cn("h-full gap-0 overflow-hidden border-t-4 py-0 transition-all hover:shadow-md", item.alerta ? "border-t-warning" : cor.borderTop, item.href && "cursor-pointer hover:-translate-y-0.5")}>
            <CardContent className="flex flex-col gap-2 py-3">
              <div className={cn("flex size-8 items-center justify-center rounded-lg", item.alerta ? "bg-warning/15 text-warning" : cn(cor.iconBg, cor.icon))}>
                <Icon className="size-4" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                <p
                  className={cn(
                    "text-lg font-bold tracking-tight",
                    item.destaque && item.valor !== undefined ? (item.valor >= 0 ? "text-success" : "text-destructive") : "text-foreground",
                  )}
                >
                  {item.texto ?? centavosParaReais(item.valor ?? 0)}
                </p>
                {item.sub ? (
                  <p className="text-[11px] text-muted-foreground">{item.sub}</p>
                ) : item.valor !== undefined && item.anterior !== undefined ? (
                  <p className={cn("flex items-center gap-1 text-[11px]", bom === null ? "text-muted-foreground" : bom ? "text-success" : "text-destructive")}>
                    <IconeVar className="size-3" />
                    {v === null ? "sem comparação" : `${v >= 0 ? "+" : ""}${v}% vs. ${rotuloAnterior}`}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
        return item.href ? (
          <Link key={item.label} href={item.href} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary">
            {conteudo}
          </Link>
        ) : (
          <div key={item.label}>{conteudo}</div>
        );
      })}
    </div>
  );
}

function FluxoMensal({
  serie,
  className,
  chaveSelecionada,
}: {
  serie: { mes: string; entradasCentavos: number; saidasCentavos: number; resultadoCentavos: number }[];
  className?: string;
  chaveSelecionada: string | null;
}) {
  const maior = Math.max(1, ...serie.flatMap((m) => [m.entradasCentavos, m.saidasCentavos]));
  const acumulado = serie.reduce((s, m) => s + m.resultadoCentavos, 0);
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold">Fluxo de caixa — 12 meses</CardTitle>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-success/80" />Entradas</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-destructive/70" />Saídas</span>
          <span>Acumulado: <strong className={acumulado >= 0 ? "text-success" : "text-destructive"}>{centavosParaReais(acumulado)}</strong></span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex h-44 items-end gap-1.5">
          {serie.map((m) => {
            const [ano, mes] = m.mes.split("-");
            const alturaE = m.entradasCentavos ? Math.max(3, Math.round((m.entradasCentavos / maior) * 100)) : 0;
            const alturaS = m.saidasCentavos ? Math.max(3, Math.round((m.saidasCentavos / maior) * 100)) : 0;
            return (
              <Link
                key={m.mes}
                href={`/financeiro?aba=dashboard&mes=${m.mes}`}
                title={`${MESES_CURTOS[Number(mes) - 1]}/${ano}: entradas ${centavosParaReais(m.entradasCentavos)}, saídas ${centavosParaReais(m.saidasCentavos)}, resultado ${centavosParaReais(m.resultadoCentavos)}`}
                className={cn("flex h-full flex-1 flex-col items-center justify-end gap-1 rounded-md px-0.5 hover:bg-muted/60", chaveSelecionada === m.mes && "bg-muted")}
              >
                <div className="flex h-full w-full items-end justify-center gap-0.5">
                  <div className="w-1/2 max-w-3 rounded-t bg-success/80" style={{ height: `${alturaE}%` }} />
                  <div className="w-1/2 max-w-3 rounded-t bg-destructive/70" style={{ height: `${alturaS}%` }} />
                </div>
              </Link>
            );
          })}
        </div>
        <div className="mt-1 flex gap-1.5">
          {serie.map((m) => {
            const mes = Number(m.mes.split("-")[1]);
            const vazio = m.entradasCentavos === 0 && m.saidasCentavos === 0;
            return (
              <div key={m.mes} className="flex flex-1 flex-col items-center">
                <span className="text-[10px] text-muted-foreground">{MESES_CURTOS[mes - 1]}</span>
                <span className={cn("text-[10px] font-semibold tabular-nums", vazio ? "text-muted-foreground/60" : m.resultadoCentavos >= 0 ? "text-success" : "text-destructive")}>
                  {vazio ? "—" : reaisCompacto(m.resultadoCentavos)}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function Dre({ dados, className }: { dados: Dados["atual"]; className?: string }) {
  const d = dados.dre;
  const linhas: { rotulo: string; valor: number; nivel: "item" | "subtotal" | "total"; sinal?: "+" | "-"; aviso?: boolean }[] = [
    { rotulo: "Receita de projetos", valor: d.receitaProjetosCentavos, nivel: "item", sinal: "+" },
    { rotulo: "(-) Custos diretos de projetos", valor: d.custosProjetosCentavos, nivel: "item", sinal: "-" },
    { rotulo: "= Margem de contribuição dos projetos", valor: d.margemContribuicaoCentavos, nivel: "subtotal" },
    { rotulo: "(+) Outras receitas", valor: d.outrasReceitasCentavos, nivel: "item", sinal: "+" },
    { rotulo: "(-) Despesas (centros de custo)", valor: d.despesasCentrosCentavos, nivel: "item", sinal: "-" },
    { rotulo: "(+) Entradas a classificar", valor: d.receitasAClassificarCentavos, nivel: "item", sinal: "+", aviso: d.receitasAClassificarCentavos > 0 },
    { rotulo: "(-) Saídas a classificar", valor: d.despesasAClassificarCentavos, nivel: "item", sinal: "-", aviso: d.despesasAClassificarCentavos > 0 },
    { rotulo: "= Resultado do período", valor: dados.resultadoCentavos, nivel: "total" },
  ];
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">DRE gerencial (caixa)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {linhas.map((l) => (
          <div
            key={l.rotulo}
            className={cn(
              "flex items-center justify-between gap-2 rounded px-2 py-1 text-sm",
              l.nivel === "subtotal" && "bg-muted/60 font-semibold",
              l.nivel === "total" && "border-t pt-2 font-bold",
              l.aviso && "text-warning",
            )}
          >
            <span>{l.rotulo}</span>
            <span
              className={cn(
                "tabular-nums",
                l.nivel !== "item" && (l.valor >= 0 ? "text-success" : "text-destructive"),
              )}
            >
              {l.sinal === "-" && l.valor > 0 ? "-" : ""}
              {centavosParaReais(l.valor)}
            </span>
          </div>
        ))}
        {(d.receitasAClassificarCentavos > 0 || d.despesasAClassificarCentavos > 0) && (
          <Link href="/financeiro?aba=conciliacao&filtroTransacao=NAO_CONCILIADA" className="block px-2 pt-1 text-xs font-medium text-primary hover:underline">
            Classificar lançamentos pendentes →
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function Centros({
  titulo,
  linhas,
  total,
  vazio,
  cor,
}: {
  titulo: string;
  linhas: { id: string; nome: string; valorCentavos: number; percentual: number }[];
  total: number;
  vazio: string;
  cor: string;
}) {
  const maior = Math.max(1, ...linhas.map((l) => l.valorCentavos));
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold">{titulo}</CardTitle>
        <Link href="/financeiro?aba=centros-custo" className="text-xs font-medium text-primary hover:underline">
          Gerenciar centros
        </Link>
      </CardHeader>
      <CardContent className="space-y-2">
        {linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">{vazio}</p>
        ) : (
          linhas.map((l) => (
            <div key={l.id} className="space-y-0.5">
              <div className="flex items-center justify-between text-sm">
                <span className="truncate">{l.nome}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {centavosParaReais(l.valorCentavos)} · {l.percentual.toLocaleString("pt-BR")}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", cor)} style={{ width: `${Math.max(2, Math.round((l.valorCentavos / maior) * 100))}%` }} />
              </div>
            </div>
          ))
        )}
        {total > 0 && linhas.length > 0 && (
          <p className="pt-1 text-[11px] text-muted-foreground">Percentual sobre o total do período ({centavosParaReais(total)}).</p>
        )}
      </CardContent>
    </Card>
  );
}

function Projetos({ projetos }: { projetos: Dados["projetos"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Resultado por projeto</CardTitle>
        <p className="text-xs text-muted-foreground">
          Entradas e saídas do período atribuídas a cada projeto (negócio). &quot;A receber&quot; compara o valor do negócio com tudo o que já entrou nele.
        </p>
      </CardHeader>
      <CardContent>
        {projetos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum lançamento atribuído a projeto nesse período. Na{" "}
            <Link href="/financeiro?aba=conciliacao" className="font-medium text-primary hover:underline">conciliação</Link>, use &quot;Projeto&quot; ou &quot;Dividir&quot; pra ligar entradas e custos aos negócios.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">Projeto</th>
                  <th className="px-2 py-2 text-right font-medium">Valor do negócio</th>
                  <th className="px-2 py-2 text-right font-medium">Recebido</th>
                  <th className="px-2 py-2 text-right font-medium">Custos</th>
                  <th className="px-2 py-2 text-right font-medium">Margem</th>
                  <th className="py-2 pl-2 text-right font-medium">A receber</th>
                </tr>
              </thead>
              <tbody>
                {projetos.map((p) => (
                  <tr key={p.negocioId} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="py-2 pr-2">
                      <Link href={`/negocios/${p.negocioId}`} className="font-medium text-foreground hover:text-primary hover:underline">
                        {p.titulo}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {[p.contatoNome, p.etapa].filter(Boolean).join(" · ")}
                      </p>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{centavosParaReais(p.valorContratoCentavos)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-success">{centavosParaReais(p.recebidoCentavos)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-destructive">{centavosParaReais(p.custosCentavos)}</td>
                    <td className={cn("px-2 py-2 text-right font-semibold tabular-nums", p.margemCentavos >= 0 ? "text-success" : "text-destructive")}>
                      {centavosParaReais(p.margemCentavos)}
                      {p.margemPercentual !== null && <span className="ml-1 text-xs font-normal text-muted-foreground">({p.margemPercentual.toLocaleString("pt-BR")}%)</span>}
                    </td>
                    <td className="py-2 pl-2 text-right tabular-nums">{p.aReceberCentavos > 0 ? centavosParaReais(p.aReceberCentavos) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
