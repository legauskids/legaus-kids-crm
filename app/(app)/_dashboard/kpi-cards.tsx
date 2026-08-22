import { Card, CardContent } from "@/components/ui/card";
import { centavosParaReais } from "@/lib/utils/money";

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
  const items = [
    { label: "Em negociação", value: centavosParaReais(kpis.valorEmNegociacaoCentavos) },
    { label: "Ganhos no mês", value: `${centavosParaReais(kpis.valorGanhoMesCentavos)} (${kpis.qtdGanhoMes})` },
    { label: "Taxa de conversão", value: `${Math.round(kpis.taxaConversao * 100)}%` },
    { label: "Ticket médio", value: centavosParaReais(kpis.ticketMedioCentavos) },
    { label: "Negócios parados", value: String(kpis.negociosParadosQtd), alerta: kpis.negociosParadosQtd > 0 },
    { label: "Tarefas atrasadas", value: String(kpis.tarefasAtrasadasQtd), alerta: kpis.tarefasAtrasadasQtd > 0 },
    { label: "Aprovações pendentes", value: String(kpis.aprovacoesPendentesQtd), alerta: kpis.aprovacoesPendentesQtd > 0 },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className={`text-lg font-semibold ${item.alerta ? "text-destructive" : ""}`}>{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
