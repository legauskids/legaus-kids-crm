import Link from "next/link";
import { ExpandablePanel } from "@/components/shared/expandable-panel";

type Agenda = {
  tarefas: { id: string; titulo: string; negocioTitulo: string | null }[];
  instalacoes: { id: string; titulo: string }[];
};

export function AgendaHojePanel({ agenda }: { agenda: Agenda }) {
  const vazio = agenda.tarefas.length === 0 && agenda.instalacoes.length === 0;

  const conteudo = (
    <div className="space-y-3">
      {vazio && <p className="text-sm text-muted-foreground">Nada agendado para hoje.</p>}
      {agenda.tarefas.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Tarefas de hoje</h4>
          <ul className="space-y-1 text-sm">
            {agenda.tarefas.map((t) => (
              <li key={t.id}>
                {t.titulo}
                {t.negocioTitulo && <span className="text-muted-foreground"> — {t.negocioTitulo}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {agenda.instalacoes.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">🚚 Instalações de hoje</h4>
          <ul className="space-y-1 text-sm">
            {agenda.instalacoes.map((i) => (
              <li key={i.id}>{i.titulo}</li>
            ))}
          </ul>
        </div>
      )}
      <Link href="/tarefas" className="text-xs text-primary hover:underline">
        Ver painel de tarefas →
      </Link>
    </div>
  );

  return <ExpandablePanel title="Agenda de hoje">{conteudo}</ExpandablePanel>;
}
