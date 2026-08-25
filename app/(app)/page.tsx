import { requireUser } from "@/lib/auth/guards";
import { getDashboardData } from "@/lib/server/dashboard";
import { KpiCards } from "@/app/(app)/_dashboard/kpi-cards";
import { MetaPanel } from "@/app/(app)/_dashboard/meta-panel";
import { FunilMiniPanel } from "@/app/(app)/_dashboard/funil-mini-panel";
import { AgendaHojePanel } from "@/app/(app)/_dashboard/agenda-hoje-panel";
import { PrecisaAtencaoPanel } from "@/app/(app)/_dashboard/precisa-atencao-panel";
import { ProducaoPanel } from "@/app/(app)/_dashboard/producao-panel";
import { EquipePanel } from "@/app/(app)/_dashboard/equipe-panel";

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await getDashboardData();

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Olá, {user.nome.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">Aqui está o resumo do seu dia.</p>
      </div>

      <KpiCards kpis={data.kpis} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MetaPanel meta={data.meta} equipe={data.equipe} />
        <FunilMiniPanel etapas={data.funilMini} />
        <AgendaHojePanel agenda={data.agendaHoje} />
        <PrecisaAtencaoPanel itens={data.precisaAtencao} />
        <ProducaoPanel producao={data.producao} />
        <EquipePanel equipe={data.equipe} />
      </div>
    </div>
  );
}
