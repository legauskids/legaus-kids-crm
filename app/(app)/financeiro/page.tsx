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

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; filtroTransacao?: string }>;
}) {
  await requireModulo("financeiro");
  const { aba, filtroTransacao } = await searchParams;
  const abaContratos = aba === "contratos";
  const abaConciliacao = aba === "conciliacao";
  const abaNotasFiscais = aba === "notas-fiscais";
  const abaSimulacao = aba === "simulacao";
  const filtroAtual: FiltroTransacoes =
    filtroTransacao === "CONCILIADA" || filtroTransacao === "IGNORADA" || filtroTransacao === "TODAS"
      ? filtroTransacao
      : "NAO_CONCILIADA";

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b bg-card px-6 py-3.5 shadow-xs">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Financeiro</h1>
        <p className="text-sm text-muted-foreground">Faturamento, pipeline de pós-venda, pendências de contrato/nota fiscal/boleto e os contratos gerados.</p>
        <div className="mt-3 flex gap-1">
          <Link
            href="/financeiro"
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              !abaContratos ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            Visão geral
          </Link>
          <Link
            href="/financeiro?aba=contratos"
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              abaContratos ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            Contratos
          </Link>
          <Link
            href="/financeiro?aba=conciliacao"
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              abaConciliacao ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            Conciliação bancária
          </Link>
          <Link
            href="/financeiro?aba=notas-fiscais"
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              abaNotasFiscais ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            Notas fiscais
          </Link>
          <Link
            href="/financeiro?aba=simulacao"
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              abaSimulacao ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            Simulação
          </Link>
        </div>
      </div>

      {abaContratos && <ContratosTabData />}
      {abaConciliacao && <ConciliacaoTabData filtroAtual={filtroAtual} />}
      {abaNotasFiscais && <NotasFiscaisTabData />}
      {abaSimulacao && <SimulacaoTabData />}
      {!abaContratos && !abaConciliacao && !abaNotasFiscais && !abaSimulacao && <VisaoGeral />}
    </div>
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
  const [transacoes, importacoes, negocios] = await Promise.all([
    listTransacoes(filtroAtual),
    listImportacoes(),
    listNegociosParaConciliacao(),
  ]);

  return (
    <ConciliacaoTab
      filtroAtual={filtroAtual}
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
