import { requireModulo } from "@/lib/auth/guards";
import { getPainelFinanceiro } from "@/lib/server/financeiro";
import { FinanceiroKpis } from "@/app/(app)/financeiro/financeiro-kpis";
import { FaturamentoChart } from "@/app/(app)/financeiro/faturamento-chart";
import { PipelinePosVenda } from "@/app/(app)/financeiro/pipeline-pos-venda";
import { PendenciasPosVenda } from "@/app/(app)/financeiro/pendencias-pos-venda";
import { RankingClientes } from "@/app/(app)/financeiro/ranking-clientes";

export default async function FinanceiroPage() {
  await requireModulo("financeiro");
  const dados = await getPainelFinanceiro();

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b bg-card px-6 py-3.5 shadow-xs">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Financeiro</h1>
        <p className="text-sm text-muted-foreground">Faturamento, pipeline de pós-venda e pendências de contrato/nota fiscal/boleto.</p>
      </div>

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
    </div>
  );
}
