import { ExpandablePanel } from "@/components/shared/expandable-panel";
import { centavosParaReais } from "@/lib/utils/money";

type EquipeItem = {
  id: string;
  nome: string;
  ganhosMesQtd: number;
  ganhosMesValorCentavos: number;
  tarefasConcluidasQtd: number;
  tarefasAtrasadasQtd: number;
};

export function EquipePanel({ equipe }: { equipe: EquipeItem[] }) {
  const conteudo = (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th className="pb-1 font-medium">Responsável</th>
          <th className="pb-1 font-medium">Ganhos</th>
          <th className="pb-1 font-medium">Tarefas concl.</th>
          <th className="pb-1 font-medium">Atrasadas</th>
        </tr>
      </thead>
      <tbody>
        {equipe.map((u) => (
          <tr key={u.id} className="border-t">
            <td className="py-1.5">{u.nome}</td>
            <td className="py-1.5">
              {centavosParaReais(u.ganhosMesValorCentavos)} ({u.ganhosMesQtd})
            </td>
            <td className="py-1.5">{u.tarefasConcluidasQtd}</td>
            <td className={`py-1.5 ${u.tarefasAtrasadasQtd > 0 ? "text-destructive" : ""}`}>
              {u.tarefasAtrasadasQtd}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return <ExpandablePanel title="Equipe">{conteudo}</ExpandablePanel>;
}
