import { Card, CardContent } from "@/components/ui/card";
import { centavosParaReais } from "@/lib/utils/money";
import { cn } from "@/lib/utils";
import { corDoIndice } from "@/lib/utils/colors";
import { TrendingUp, TrendingDown, Minus, Target, Handshake, FileClock } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function FinanceiroKpis({
  faturamentoMesAtualCentavos,
  variacaoPercentual,
  ticketMedioCentavos,
  negociosGanhosJanelaQtd,
  pipelinePosVendaValorTotalCentavos,
  pendenciasQtd,
}: {
  faturamentoMesAtualCentavos: number;
  variacaoPercentual: number | null;
  ticketMedioCentavos: number;
  negociosGanhosJanelaQtd: number;
  pipelinePosVendaValorTotalCentavos: number;
  pendenciasQtd: number;
}) {
  const IconeVariacao = variacaoPercentual == null ? Minus : variacaoPercentual >= 0 ? TrendingUp : TrendingDown;
  const variacaoTexto =
    variacaoPercentual == null ? "sem comparação" : `${variacaoPercentual >= 0 ? "+" : ""}${variacaoPercentual}% vs. mês anterior`;

  const items: { label: string; value: string; sub?: string; icon: LucideIcon; corIndice: number; alerta?: boolean }[] = [
    { label: "Faturamento do mês", value: centavosParaReais(faturamentoMesAtualCentavos), sub: variacaoTexto, icon: IconeVariacao, corIndice: 0 },
    { label: "Ticket médio (6 meses)", value: centavosParaReais(ticketMedioCentavos), icon: Target, corIndice: 2 },
    { label: "Negócios ganhos (6 meses)", value: String(negociosGanhosJanelaQtd), icon: Handshake, corIndice: 1 },
    { label: "Em pós-venda", value: centavosParaReais(pipelinePosVendaValorTotalCentavos), icon: Handshake, corIndice: 3 },
    {
      label: "Pendências (contrato/NF/boleto)",
      value: String(pendenciasQtd),
      icon: FileClock,
      corIndice: 5,
      alerta: pendenciasQtd > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon;
        const cor = corDoIndice(item.corIndice);
        return (
          <Card
            key={item.label}
            className={cn(
              "gap-0 overflow-hidden border-t-4 py-0 transition-shadow hover:shadow-md",
              item.alerta ? "border-t-destructive" : cor.borderTop,
            )}
          >
            <CardContent className="flex flex-col gap-2 py-3">
              <div
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg",
                  item.alerta ? "bg-destructive/10 text-destructive" : cn(cor.iconBg, cor.icon),
                )}
              >
                <Icon className="size-4" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                <p className={cn("text-lg font-bold tracking-tight", item.alerta ? "text-destructive" : "text-foreground")}>{item.value}</p>
                {item.sub && <p className="text-[11px] text-muted-foreground">{item.sub}</p>}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
