import Link from "next/link";
import { ExpandablePanel } from "@/components/shared/expandable-panel";

type Producao = { emProducaoQtd: number; progressoMedio: number; instalacoesSemanaQtd: number };

export function ProducaoPanel({ producao }: { producao: Producao }) {
  const conteudo = (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between">
        <span>🔧 Projetos em produção</span>
        <span className="font-medium">{producao.emProducaoQtd}</span>
      </div>
      <div className="flex justify-between">
        <span>Progresso médio</span>
        <span className="font-medium">{producao.progressoMedio}%</span>
      </div>
      <div className="flex justify-between">
        <span>🚚 Instalações desta semana</span>
        <span className="font-medium">{producao.instalacoesSemanaQtd}</span>
      </div>
      <Link href="/producao" className="text-xs text-primary hover:underline">
        Ver painel de produção →
      </Link>
    </div>
  );

  return <ExpandablePanel title="Produção">{conteudo}</ExpandablePanel>;
}
