import { Card, CardContent } from "@/components/ui/card";
import { centavosParaReais } from "@/lib/utils/money";
import { cn } from "@/lib/utils";
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
  const items: { label: string; value: string; icon: LucideIcon; tone: "primary" | "success" | "neutral" | "alerta"; alerta?: boolean }[] = [
    { label: "Em negociação", value: centavosParaReais(kpis.valorEmNegociacaoCentavos), icon: Handshake, tone: "primary" },
    {
      label: "Ganhos no mês",
      value: `${centavosParaReais(kpis.valorGanhoMesCentavos)} (${kpis.qtdGanhoMes})`,
      icon: TrendingUp,
      tone: "success",
    },
    { label: "Taxa de conversão", value: `${Math.round(kpis.taxaConversao * 100)}%`, icon: Percent, tone: "success" },
    { label: "Ticket médio", value: centavosParaReais(kpis.ticketMedioCentavos), icon: Target, tone: "neutral" },
    {
      label: "Negócios parados",
      value: String(kpis.negociosParadosQtd),
      icon: PauseCircle,
      tone: kpis.negociosParadosQtd > 0 ? "alerta" : "neutral",
      alerta: kpis.negociosParadosQtd > 0,
    },
    {
      label: "Tarefas atrasadas",
      value: String(kpis.tarefasAtrasadasQtd),
      icon: ClockAlert,
      tone: kpis.tarefasAtrasadasQtd > 0 ? "alerta" : "neutral",
      alerta: kpis.tarefasAtrasadasQtd > 0,
    },
    {
      label: "Aprovações pendentes",
      value: String(kpis.aprovacoesPendentesQtd),
      icon: ShieldAlert,
      tone: kpis.aprovacoesPendentesQtd > 0 ? "alerta" : "neutral",
      alerta: kpis.aprovacoesPendentesQtd > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label} className="transition-shadow hover:shadow-md">
            <CardContent className="flex flex-col gap-2 py-3">
              <div
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg",
                  item.tone === "primary" && "bg-accent text-accent-foreground",
                  item.tone === "success" && "bg-success/15 text-success",
                  item.tone === "neutral" && "bg-muted text-muted-foreground",
                  item.tone === "alerta" && "bg-destructive/10 text-destructive",
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
