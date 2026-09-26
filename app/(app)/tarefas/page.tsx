import { requireModulo } from "@/lib/auth/guards";
import { listTarefas } from "@/lib/server/tarefas";
import { listFunisComEtapas } from "@/lib/server/negocios";
import { prisma } from "@/lib/db";
import { TarefasShell } from "@/app/(app)/tarefas/tarefas-shell";

export default async function TarefasPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireModulo("tarefas");
  // ?status=ATRASADA / APROVACAO — vindo dos cards do dashboard.
  const { status: statusInicial } = await searchParams;

  const [tarefas, funis, usuarios, negocios] = await Promise.all([
    listTarefas(),
    listFunisComEtapas(),
    prisma.user.findMany({ orderBy: { nome: "asc" } }),
    prisma.negocio.findMany({
      include: { contato: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);

  return (
    <TarefasShell
      statusInicial={statusInicial}
      tarefas={tarefas.map((t) => ({
        id: t.id,
        titulo: t.titulo,
        status: t.status,
        prazo: t.prazo.toISOString(),
        descricao: t.descricao,
        automatica: t.automatica,
        responsavelId: t.responsavelId,
        responsavelNome: t.responsavel.nome,
        solicitanteId: t.solicitanteId,
        negocioId: t.negocioId,
        negocioTitulo: t.negocio?.titulo ?? null,
        funilId: t.negocio?.funilId ?? null,
        etapaId: t.negocio?.etapaId ?? null,
        checklist: t.checklist.map((c) => ({ id: c.id, texto: c.texto, concluido: c.concluido })),
      }))}
      funis={funis.map((f) => ({
        id: f.id,
        nome: f.nome,
        etapas: f.etapas.map((e) => ({ id: e.id, nome: e.nome })),
      }))}
      usuarios={usuarios.map((u) => ({ id: u.id, nome: u.nome }))}
      negocios={negocios.map((n) => ({ id: n.id, titulo: n.titulo, contatoNome: n.contato?.nome ?? "Sem contato" }))}
    />
  );
}
