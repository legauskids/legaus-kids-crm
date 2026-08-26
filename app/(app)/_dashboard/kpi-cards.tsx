import { Card, CardContent } from "@/components/ui/card";
import { centavosParaReais } from "@/lib/utils/money";
import { cn } from "@/lib/utils";
import { corDoIndice } from "@/lib/utils/colors";
import {
  Handshake,
  TrendingUp,
  Percent,
  Target,
  PauseCircle,
  ClockAlert,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

type Kpis = {
  valorEmNegociacaoCentavos: number;
  valorGanhoMesCentavos: number;
  qtdGanhoMes: number;
  taxaConversao: number;
  ticketMedioCentavos: number;
  negociosParadosQtd: number;
  tarefasAtrasadasQtd: number;
  aprovacoesPendentesQtd: number;
};

export function KpiCards({ kpis }: { kpis: Kpis }) {
  const items: { label: string; value: string; icon: LucideIcon; corIndice: number; alerta?: boolean }[] = [
    { label: "Em negociação", value: centavosParaReais(kpis.valorEmNegociacaoCentavos), icon: Handshake, corIndice: 0 },
    {
      label: "Ganhos no mês",
      value: `${centavosParaReais(kpis.valorGanhoMesCentavos)} (${kpis.qtdGanhoMes})`,
      icon: TrendingUp,
      corIndice: 1,
    },
    { label: "Taxa de conversão", value: `${Math.round(kpis.taxaConversao * 100)}%`, icon: Percent, corIndice: 2 },
    { label: "Ticket médio", value: centavosParaReais(kpis.ticketMedioCentavos), icon: Target, corIndice: 3 },
    {
      label: "Negócios parados",
      value: String(kpis.negociosParadosQtd),
      icon: PauseCircle,
      corIndice: 4,
      alerta: kpis.negociosParadosQtd > 0,
    },
    {
      label: "Tarefas atrasadas",
      value: String(kpis.tarefasAtrasadasQtd),
      icon: ClockAlert,
      corIndice: 5,
      alerta: kpis.tarefasAtrasadasQtd > 0,
    },
    {
      label: "Aprovações pendentes",
      value: String(kpis.aprovacoesPendentesQtd),
      icon: ShieldAlert,
      corIndice: 6,
      alerta: kpis.aprovacoesPendentesQtd > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
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
                <p className={cn("text-lg font-bold tracking-tight", item.alerta ? "text-destructive" : "text-foreground")}>
                  {item.value}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
