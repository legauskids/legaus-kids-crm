import Link from "next/link";
import { ExpandablePanel } from "@/components/shared/expandable-panel";
import { Badge } from "@/components/ui/badge";

type Item = {
  tipo: "negocio_parado" | "aprovacao" | "tarefa_atrasada";
  id: string;
  titulo: string;
  subtitulo: string;
};

const TIPO_LABEL: Record<Item["tipo"], string> = {
  negocio_parado: "Negócio parado",
  aprovacao: "Aprovação pendente",
  tarefa_atrasada: "Tarefa atrasada",
};

function hrefPara(item: Item): string {
  if (item.tipo === "negocio_parado") return `/negocios/${item.id}`;
  return "/tarefas";
}

function Lista({ itens }: { itens: Item[] }) {
  if (itens.length === 0) {
    return <p className="text-sm text-muted-foreground">Tudo em dia — nada precisa da sua atenção agora.</p>;
  }
  return (
    <ul className="space-y-2">
      {itens.map((item) => (
        <li key={`${item.tipo}-${item.id}`}>
          <Link
            href={hrefPara(item)}
            className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm transition-colors hover:bg-muted/50"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{item.titulo}</p>
              <p className="truncate text-xs text-muted-foreground">{item.subtitulo}</p>
            </div>
            <Badge variant="destructive" className="shrink-0">
              {TIPO_LABEL[item.tipo]}
            </Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function PrecisaAtencaoPanel({ itens }: { itens: Item[] }) {
  return (
    <ExpandablePanel title="Precisa da sua atenção" expandedChildren={<Lista itens={itens} />}>
      <Lista itens={itens.slice(0, 5)} />
    </ExpandablePanel>
  );
}
