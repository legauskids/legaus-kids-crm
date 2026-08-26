import { ExpandablePanel } from "@/components/shared/expandable-panel";
import { corDoIndice } from "@/lib/utils/colors";
import { centavosParaReais } from "@/lib/utils/money";

type EtapaResumo = { etapaId: string; nome: string; quantidade: number; valorCentavos: number };

export function FunilMiniPanel({ etapas }: { etapas: EtapaResumo[] }) {
  const maxValor = Math.max(1, ...etapas.map((e) => e.valorCentavos));

  const conteudo = (
    <div className="space-y-2">
      {etapas.map((e) => (
        <div key={e.etapaId} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span>{e.nome}</span>
            <span className="text-muted-foreground">
              {e.quantidade} · {centavosParaReais(e.valorCentavos)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(e.valorCentavos / maxValor) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <ExpandablePanel title="Funil de vendas" cor={corDoIndice(1)}>
      {conteudo}
    </ExpandablePanel>
  );
}
