import { requireUser } from "@/lib/auth/guards";
import { getDashboardData } from "@/lib/server/dashboard";
import { KpiCards } from "@/app/(app)/_dashboard/kpi-cards";
import { MetaPanel } from "@/app/(app)/_dashboard/meta-panel";
import { FunilMiniPanel } from "@/app/(app)/_dashboard/funil-mini-panel";
import { AgendaHojePanel } from "@/app/(app)/_dashboard/agenda-hoje-panel";
import { PrecisaAtencaoPanel } from "@/app/(app)/_dashboard/precisa-atencao-panel";
import { ProducaoPanel } from "@/app/(app)/_dashboard/producao-panel";
import { EquipePanel } from "@/app/(app)/_dashboard/equipe-panel";
import { CompromissosPanel } from "@/app/(app)/_dashboard/compromissos-panel";
import { getPainelCompromissos, listUsuariosComCompromissos } from "@/lib/server/compromissos";
import { prisma } from "@/lib/db";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ compromissosDe?: string }> }) {
  const user = await requireUser();
  // Compromissos: cada um vê os próprios; o administrador pode ver os de outra pessoa (?compromissosDe=).
  const { compromissosDe } = await searchParams;
  const alvoCompromissos = user.isAdmin && compromissosDe ? compromissosDe : user.id;
  const [data, painelCompromissos, pessoas] = await Promise.all([
    getDashboardData(),
    getPainelCompromissos(alvoCompromissos),
    user.isAdmin ? listUsuariosComCompromissos() : Promise.resolve([]),
  ]);
  // Diálogo do "Planejar amanhã" (mesmo da aba Tarefas).
  const [usuarios, negocios] = painelCompromissos?.planejar
    ? await Promise.all([
        prisma.user.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
        prisma.negocio.findMany({ include: { contato: true }, orderBy: { updatedAt: "desc" }, take: 100 }),
      ])
    : [[], []];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Olá, {user.nome.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">Aqui está o resumo do seu dia.</p>
      </div>

      <KpiCards kpis={data.kpis} funilVendaId={data.funilVendaId} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {painelCompromissos && (
          <div className="lg:col-span-2">
            <CompromissosPanel
              painel={painelCompromissos}
              pessoas={pessoas}
              usuarios={usuarios}
              negocios={negocios.map((n) => ({ id: n.id, titulo: n.titulo, contatoNome: n.contato?.nome ?? "Sem contato" }))}
            />
          </div>
        )}
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
