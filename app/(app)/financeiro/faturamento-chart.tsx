import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { centavosParaReais } from "@/lib/utils/money";

const NOMES_MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function rotuloMes(chave: string): string {
  const [, mes] = chave.split("-");
  return NOMES_MES[Number(mes) - 1] ?? chave;
}

export function FaturamentoChart({ faturamentoPorMes }: { faturamentoPorMes: { mes: string; valorCentavos: number }[] }) {
  const maior = Math.max(1, ...faturamentoPorMes.map((m) => m.valorCentavos));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Faturamento — últimos 6 meses</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex h-40 items-end gap-3">
          {faturamentoPorMes.map((m, i) => {
            const altura = Math.max(4, Math.round((m.valorCentavos / maior) * 100));
            const ultimo = i === faturamentoPorMes.length - 1;
            return (
              <div key={m.mes} className="flex flex-1 flex-col items-center gap-1.5">
                <p className="text-[10px] font-medium tabular-nums text-muted-foreground">
                  {m.valorCentavos > 0 ? centavosParaReais(m.valorCentavos) : "—"}
                </p>
                <div className="flex h-28 w-full items-end overflow-hidden rounded-md bg-muted">
                  <div
                    className={ultimo ? "w-full rounded-md bg-primary transition-all" : "w-full rounded-md bg-primary/40 transition-all"}
                    style={{ height: `${altura}%` }}
                  />
                </div>
                <p className="text-[11px] font-medium text-foreground">{rotuloMes(m.mes)}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
