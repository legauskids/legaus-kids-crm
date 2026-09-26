import Link from "next/link";
import { cn } from "@/lib/utils";
import { requireModulo } from "@/lib/auth/guards";
import { getPainelFinanceiro } from "@/lib/server/financeiro";
import { getModeloContratoAtivo, listarContratos, listarNegociosParaSeletor, CAMPOS_MODELO_CONTRATO } from "@/lib/server/contratos";
import { listImportacoes, listTransacoes, listNegociosParaConciliacao, type FiltroTransacoes } from "@/lib/server/conciliacao-bancaria";
import {
  listContatosParaNotaFiscal,
  listNegociosParaNotaFiscal,
  listOrcamentosParaNotaFiscal,
  listNotasFiscais,
  focusNfeConfigurado,
} from "@/lib/server/nota-fiscal";
import { FinanceiroKpis } from "@/app/(app)/financeiro/financeiro-kpis";
import { FaturamentoChart } from "@/app/(app)/financeiro/faturamento-chart";
import { PipelinePosVenda } from "@/app/(app)/financeiro/pipeline-pos-venda";
import { PendenciasPosVenda } from "@/app/(app)/financeiro/pendencias-pos-venda";
import { RankingClientes } from "@/app/(app)/financeiro/ranking-clientes";
import { ContratosTab } from "@/app/(app)/financeiro/contratos-tab";
import { ConciliacaoTab } from "@/app/(app)/financeiro/conciliacao-tab";
import { NotasFiscaisTab } from "@/app/(app)/financeiro/notas-fiscais-tab";
import { SimulacaoTab } from "@/app/(app)/financeiro/simulacao-tab";
import { listSimulacoes } from "@/lib/server/simulacao-financeira";
import { listCentrosCusto } from "@/lib/server/centros-custo";
import { getDashboardFinanceiro, resolverPeriodoFinanceiro } from "@/lib/server/resultado-financeiro";
import { sugerirCentroCusto } from "@/lib/utils/centro-custo";
import { prisma } from "@/lib/db";
import { DashboardFinanceiroTab } from "@/app/(app)/financeiro/dashboard-financeiro-tab";
import { CentrosCustoTab } from "@/app/(app)/financeiro/centros-custo-tab";

const ABAS = [
  { id: "visao-geral", label: "Visão geral", href: "/financeiro" },
  { id: "dashboard", label: "Dashboard financeiro", href: "/financeiro?aba=dashboard" },
  { id: "conciliacao", label: "Conciliação bancária", href: "/financeiro?aba=conciliacao" },
  { id: "centros-custo", label: "Centros de custo", href: "/financeiro?aba=centros-custo" },
  { id: "contratos", label: "Contratos", href: "/financeiro?aba=contratos" },
  { id: "notas-fiscais", label: "Notas fiscais", href: "/financeiro?aba=notas-fiscais" },
  { id: "simulacao", label: "Simulação", href: "/financeiro?aba=simulacao" },
] as const;

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; filtroTransacao?: string; mes?: string; ano?: string }>;
}) {
  await requireModulo("financeiro");
  const { aba, filtroTransacao, mes, ano } = await searchParams;
  const abaAtual = ABAS.find((a) => a.id === aba)?.id ?? "visao-geral";
  const filtroAtual: FiltroTransacoes =
    filtroTransacao === "CONCILIADA" || filtroTransacao === "IGNORADA" || filtroTransacao === "TODAS"
      ? filtroTransacao
      : "NAO_CONCILIADA";

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b bg-card px-6 py-3.5 shadow-xs">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Financeiro</h1>
        <p className="text-sm text-muted-foreground">
          Resultado de caixa por projeto e centro de custo, faturamento, conciliação bancária, contratos e notas fiscais.
        </p>
        <div className="mt-3 flex flex-wrap gap-1">
          {ABAS.map((a) => (
            <Link
              key={a.id}
              href={a.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                abaAtual === a.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {a.label}
            </Link>
          ))}
        </div>
      </div>

      {abaAtual === "dashboard" && <DashboardFinanceiroTabData mes={mes} ano={ano} />}
      {abaAtual === "conciliacao" && <ConciliacaoTabData filtroAtual={filtroAtual} />}
      {abaAtual === "centros-custo" && <CentrosCustoTabData />}
      {abaAtual === "contratos" && <ContratosTabData />}
      {abaAtual === "notas-fiscais" && <NotasFiscaisTabData />}
      {abaAtual === "simulacao" && <SimulacaoTabData />}
      {abaAtual === "visao-geral" && <VisaoGeral />}
    </div>
  );
}

async function DashboardFinanceiroTabData({ mes, ano }: { mes?: string; ano?: string }) {
  const periodo = resolverPeriodoFinanceiro({ mes, ano });
  const dados = await getDashboardFinanceiro(periodo);
  return <DashboardFinanceiroTab periodo={periodo} dados={dados} />;
}

async function CentrosCustoTabData() {
  const [centros, totais] = await Promise.all([
    listCentrosCusto({ incluirInativos: true }),
    prisma.rateioTransacao.groupBy({ by: ["centroCustoId"], where: { centroCustoId: { not: null } }, _sum: { valorCentavos: true } }),
  ]);
  const totalPorCentro = new Map(totais.map((t) => [t.centroCustoId, t._sum.valorCentavos ?? 0]));
  return (
    <CentrosCustoTab
      centros={centros.map((c) => ({
        id: c.id,
        nome: c.nome,
        tipo: c.tipo,
        palavrasChave: c.palavrasChave,
        ativo: c.ativo,
        totalRateadoCentavos: totalPorCentro.get(c.id) ?? 0,
      }))}
    />
  );
}

async function VisaoGeral() {
  const dados = await getPainelFinanceiro();
  return (
    <div className="flex-1 space-y-5 p-6">
      <FinanceiroKpis
        faturamentoMesAtualCentavos={dados.faturamentoMesAtualCentavos}
        variacaoPercentual={dados.variacaoPercentual}
        ticketMedioCentavos={dados.ticketMedioCentavos}
        negociosGanhosJanelaQtd={dados.negociosGanhosJanelaQtd}
        pipelinePosVendaValorTotalCentavos={dados.pipelinePosVendaValorTotalCentavos}
        pendenciasQtd={dados.pendenciasPosVenda.length}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <FaturamentoChart faturamentoPorMes={dados.faturamentoPorMes} />
        <PipelinePosVenda etapas={dados.pipelinePosVenda} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <PendenciasPosVenda pendencias={dados.pendenciasPosVenda} />
        <RankingClientes clientes={dados.rankingClientes} />
      </div>
    </div>
  );
}

async function ContratosTabData() {
  const [modelo, contratos, negocios] = await Promise.all([
    getModeloContratoAtivo(),
    listarContratos(),
    listarNegociosParaSeletor(),
  ]);

  return (
    <ContratosTab
      modeloConteudo={modelo.conteudo}
      camposDisponiveis={CAMPOS_MODELO_CONTRATO}
      contratos={contratos.map((c) => ({
        id: c.id,
        numero: c.numero,
        status: c.status,
        criadoEm: c.criadoEm.toISOString(),
        negocioTitulo: c.negocio.titulo,
        contatoNome: c.negocio.contato?.nome ?? null,
        empresaEmissora: c.empresaEmissora,
      }))}
      negociosParaSeletor={negocios.map((n) => ({ id: n.id, titulo: n.titulo, contatoNome: n.contato?.nome ?? null }))}
    />
  );
}

async function ConciliacaoTabData({ filtroAtual }: { filtroAtual: FiltroTransacoes }) {
  const [transacoes, importacoes, negocios, centros] = await Promise.all([
    listTransacoes(filtroAtual),
    listImportacoes(),
    listNegociosParaConciliacao(),
    listCentrosCusto(),
  ]);

  return (
    <ConciliacaoTab
      filtroAtual={filtroAtual}
      centros={centros.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo }))}
      transacoes={transacoes.map((t) => ({
        id: t.id,
        data: t.data.toISOString(),
        descricao: t.descricao,
        valorCentavos: t.valorCentavos,
        tipo: t.tipo,
        status: t.status,
        negocioId: t.negocioId,
        negocioTitulo: t.negocio?.titulo ?? null,
        contatoNome: t.negocio?.contato?.nome ?? null,
        rateios: t.rateios.map((r) => ({
          id: r.id,
          valorCentavos: r.valorCentavos,
          negocioId: r.negocioId,
          negocioTitulo: r.negocio?.titulo ?? null,
          centroCustoId: r.centroCustoId,
          centroCustoNome: r.centroCusto?.nome ?? null,
        })),
        sugestaoCentroCustoId: t.status === "NAO_CONCILIADA" ? (sugerirCentroCusto(t.descricao, t.tipo, centros)?.id ?? null) : null,
      }))}
      importacoes={importacoes.map((i) => ({
        id: i.id,
        nomeArquivo: i.nomeArquivo,
        importadoEm: i.importadoEm.toISOString(),
        importadoPorNome: i.importadoPor.nome,
        quantidadeTransacoes: i.quantidadeTransacoes,
        naoConciliadas: i._count.transacoes,
      }))}
      negocios={negocios.map((n) => ({ id: n.id, titulo: n.titulo, valorCentavos: n.valorCentavos, contatoNome: n.contato?.nome ?? null }))}
    />
  );
}

async function NotasFiscaisTabData() {
  const [contatos, negocios, orcamentos, notasFiscais] = await Promise.all([
    listContatosParaNotaFiscal(),
    listNegociosParaNotaFiscal(),
    listOrcamentosParaNotaFiscal(),
    listNotasFiscais(),
  ]);

  return (
    <NotasFiscaisTab
      focusNfeConfigurado={focusNfeConfigurado()}
      contatos={contatos}
      negocios={negocios
        .filter((n) => n.contatoId !== null)
        .map((n) => ({ id: n.id, contatoId: n.contatoId as string, titulo: n.titulo, produto: n.produto, descricao: n.descricao, valorCentavos: n.valorCentavos }))}
      orcamentos={orcamentos
        .filter((o) => o.contatoId !== null)
        .map((o) => ({ id: o.id, contatoId: o.contatoId as string, numero: o.numero, descontoCentavos: o.descontoCentavos, itens: o.itens }))}
      notasFiscais={notasFiscais.map((n) => ({
        id: n.id,
        status: n.status,
        numero: n.numero,
        motivoRejeicao: n.motivoRejeicao,
        valorTotalCentavos: n.valorTotalCentavos,
        criadaEm: n.criadaEm.toISOString(),
        contatoNome: n.contato.nome,
        origemLabel: n.negocio ? n.negocio.titulo : n.orcamento ? `Orçamento #${String(n.orcamento.numero).padStart(4, "0")}` : null,
        temXml: n.xmlBytes !== null,
        temDanfe: n.danfeBytes !== null,
      }))}
    />
  );
}

async function SimulacaoTabData() {
  const simulacoes = await listSimulacoes();
  return (
    <SimulacaoTab
      simulacoes={simulacoes.map((s) => ({
        id: s.id,
        descricao: s.descricao,
        valorCentavos: s.valorCentavos,
        tipo: s.tipo,
        data: s.data ? s.data.toISOString() : null,
      }))}
    />
  );
}
