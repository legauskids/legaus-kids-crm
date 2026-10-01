import { requireModulo } from "@/lib/auth/guards";
import { listTarefas } from "@/lib/server/tarefas";
import { listFunisComEtapas } from "@/lib/server/negocios";
import { prisma } from "@/lib/db";
import { TarefasShell } from "@/app/(app)/tarefas/tarefas-shell";
import { getFiltroTarefasCompromisso } from "@/lib/server/compromissos";
import { diaBrasilia } from "@/lib/utils/brasilia";

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; categoria?: string; compromisso?: string; de?: string; dia?: string }>;
}) {
  const user = await requireModulo("tarefas");
  // ?status=ATRASADA / APROVACAO — vindo dos cards do dashboard.
  // ?compromisso=<id|diarios>&de=<usuário>&dia=AAAA-MM-DD — vindo do card de
  // Compromissos: mostra só as tarefas que estão somando ali. Só o
  // administrador vê as de outra pessoa.
  const { status: statusInicial, categoria, compromisso, de, dia } = await searchParams;
  const filtroCompromisso = compromisso
    ? await getFiltroTarefasCompromisso({
        usuarioId: user.isAdmin && de ? de : user.id,
        compromissoId: compromisso,
        dia: dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : diaBrasilia(new Date()),
      })
    : null;

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
      categoriaInicial={categoria}
      filtroCompromisso={filtroCompromisso}
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
        reuniaoId: t.reuniao?.id ?? null,
        reuniaoTitulo: t.reuniao?.titulo ?? null,
        categoriaId: t.categoriaId,
        link: t.link,
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
