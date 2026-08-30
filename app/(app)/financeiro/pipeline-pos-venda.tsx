import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { centavosParaReais } from "@/lib/utils/money";

export function PipelinePosVenda({ etapas }: { etapas: { etapa: string; quantidade: number; valorCentavos: number }[] }) {
  const total = Math.max(1, etapas.reduce((acc, e) => acc + e.valorCentavos, 0));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Pipeline de pós-venda</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {etapas.every((e) => e.quantidade === 0) ? (
          <p className="text-sm text-muted-foreground">Nenhum negócio em pós-venda no momento.</p>
        ) : (
          etapas.map((e) => (
            <div key={e.etapa} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">
                  {e.etapa} <span className="text-muted-foreground">({e.quantidade})</span>
                </span>
                <span className="tabular-nums text-muted-foreground">{centavosParaReais(e.valorCentavos)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((e.valorCentavos / total) * 100)}%` }} />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
