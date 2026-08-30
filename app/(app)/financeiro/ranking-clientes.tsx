import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { centavosParaReais } from "@/lib/utils/money";

export function RankingClientes({ clientes }: { clientes: { nome: string; valorCentavos: number; qtd: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Top clientes (6 meses)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {clientes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum negócio ganho nos últimos 6 meses ainda.</p>
        ) : (
          clientes.map((c, i) => (
            <div key={c.nome} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                  {i + 1}
                </span>
                <div>
                  <p className="font-medium text-foreground">{c.nome}</p>
                  <p className="text-[11px] text-muted-foreground">{c.qtd} negócio{c.qtd > 1 ? "s" : ""}</p>
                </div>
              </div>
              <span className="tabular-nums font-medium text-foreground">{centavosParaReais(c.valorCentavos)}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
