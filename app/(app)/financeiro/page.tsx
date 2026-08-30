import Link from "next/link";
import { cn } from "@/lib/utils";
import { requireModulo } from "@/lib/auth/guards";
import { getPainelFinanceiro } from "@/lib/server/financeiro";
import { getModeloContratoAtivo, listarContratos, listarNegociosParaSeletor, CAMPOS_MODELO_CONTRATO } from "@/lib/server/contratos";
import { FinanceiroKpis } from "@/app/(app)/financeiro/financeiro-kpis";
import { FaturamentoChart } from "@/app/(app)/financeiro/faturamento-chart";
import { PipelinePosVenda } from "@/app/(app)/financeiro/pipeline-pos-venda";
import { PendenciasPosVenda } from "@/app/(app)/financeiro/pendencias-pos-venda";
import { RankingClientes } from "@/app/(app)/financeiro/ranking-clientes";
import { ContratosTab } from "@/app/(app)/financeiro/contratos-tab";

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  await requireModulo("financeiro");
  const { aba } = await searchParams;
  const abaContratos = aba === "contratos";

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
        </div>
      </div>

      {abaContratos ? <ContratosTabData /> : <VisaoGeral />}
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
      }))}
      negociosParaSeletor={negocios.map((n) => ({ id: n.id, titulo: n.titulo, contatoNome: n.contato?.nome ?? null }))}
    />
  );
}
