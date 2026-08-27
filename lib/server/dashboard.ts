import "server-only";
import { prisma } from "@/lib/db";
import { negocioParadoAlemDoPrazo, tarefaAtrasada, isHoje, estaNoPeriodo } from "@/lib/utils/dates";

function inicioDoMes(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function fimDoMes(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export async function getDashboardData() {
  const inicio = inicioDoMes();
  const fim = fimDoMes();

  const [
    funilVenda,
    negociosVenda,
    negociosAbertosTodosFunis,
    tarefasAbertas,
    tarefasAprovacao,
    tarefasConcluidasMes,
    usuarios,
    meta,
    emProducao,
    instalacoes,
  ] = await Promise.all([
    prisma.funil.findFirst({ where: { nome: "Funil de venda" }, include: { etapas: { orderBy: { ordem: "asc" } } } }),
    prisma.negocio.findMany({
      where: { funil: { nome: "Funil de venda" } },
      include: { etapa: true, responsavel: true, contato: true },
    }),
    prisma.negocio.findMany({
      where: { etapa: { tipo: "NORMAL" } },
      include: { etapa: true, contato: true },
    }),
    prisma.tarefa.findMany({
      where: { status: { not: "CONCLUIDA" } },
      include: { responsavel: true, negocio: true },
    }),
    prisma.tarefa.findMany({ where: { status: "APROVACAO" }, include: { responsavel: true, negocio: true } }),
    prisma.tarefa.findMany({
      where: { status: "CONCLUIDA", updatedAt: { gte: inicio, lt: fim } },
      select: { id: true, responsavelId: true },
    }),
    prisma.user.findMany(),
    prisma.meta.findFirst({ where: { mes: new Date().getMonth() + 1, ano: new Date().getFullYear() } }),
    prisma.negocio.findMany({ where: { etapa: { nome: "Produção" } } }),
    prisma.negocio.findMany({ where: { dataInstalacao: { not: null } }, include: { contato: true } }),
  ]);

  const ganhosMes = negociosVenda.filter(
    (n) => n.etapa.tipo === "GANHO" && n.dataEntradaNaEtapa >= inicio && n.dataEntradaNaEtapa < fim,
  );
  const perdidosMes = negociosVenda.filter(
    (n) => n.etapa.tipo === "PERDIDO" && n.dataEntradaNaEtapa >= inicio && n.dataEntradaNaEtapa < fim,
  );
  const emNegociacao = negociosVenda.filter((n) => n.etapa.tipo === "NORMAL");

  const valorEmNegociacaoCentavos = emNegociacao.reduce((acc, n) => acc + n.valorCentavos, 0);
  const valorGanhoMesCentavos = ganhosMes.reduce((acc, n) => acc + n.valorCentavos, 0);
  const qtdGanhoMes = ganhosMes.length;
  const totalFechadosMes = qtdGanhoMes + perdidosMes.length;
  const taxaConversao = totalFechadosMes > 0 ? qtdGanhoMes / totalFechadosMes : 0;
  const ticketMedioCentavos = qtdGanhoMes > 0 ? Math.round(valorGanhoMesCentavos / qtdGanhoMes) : 0;

  const negociosParados = negociosAbertosTodosFunis.filter((n) =>
    negocioParadoAlemDoPrazo({ slaDias: n.etapa.slaDias, dataEntradaNaEtapa: n.dataEntradaNaEtapa }),
  );

  const tarefasAtrasadas = tarefasAbertas.filter((t) => tarefaAtrasada(t.prazo, t.status));
  const aprovacoesPendentes = tarefasAprovacao;

  const tarefasHoje = tarefasAbertas.filter((t) => isHoje(t.prazo));
  const instalacoesHoje = instalacoes.filter((n) => isHoje(n.dataInstalacao!));

  const precisaAtencao = [
    ...negociosParados.map((n) => ({
      tipo: "negocio_parado" as const,
      id: n.id,
      titulo: n.titulo,
      subtitulo: n.contato?.nome ?? "Sem contato",
    })),
    ...aprovacoesPendentes.map((t) => ({
      tipo: "aprovacao" as const,
      id: t.id,
      titulo: t.titulo,
      subtitulo: t.negocio?.titulo ?? "Tarefa avulsa",
    })),
    ...tarefasAtrasadas.map((t) => ({
      tipo: "tarefa_atrasada" as const,
      id: t.id,
      titulo: t.titulo,
      subtitulo: t.responsavel.nome,
    })),
  ];

  const funilMini = (funilVenda?.etapas ?? []).map((etapa) => {
    const negociosDaEtapa = negociosVenda.filter((n) => n.etapaId === etapa.id);
    return {
      etapaId: etapa.id,
      nome: etapa.nome,
      quantidade: negociosDaEtapa.length,
      valorCentavos: negociosDaEtapa.reduce((acc, n) => acc + n.valorCentavos, 0),
    };
  });

  const instalacoesSemana = instalacoes.filter((n) => estaNoPeriodo(n.dataInstalacao!, "semana"));
  const progressoMedioProducao =
    emProducao.length > 0
      ? Math.round(emProducao.reduce((acc, n) => acc + (n.progressoProducao ?? 0), 0) / emProducao.length)
      : 0;

  const porSemana = new Map<number, { valorCentavos: number; qtd: number }>();
  for (const n of ganhosMes) {
    const semana = Math.ceil(n.dataEntradaNaEtapa.getDate() / 7);
    const atual = porSemana.get(semana) ?? { valorCentavos: 0, qtd: 0 };
    porSemana.set(semana, { valorCentavos: atual.valorCentavos + n.valorCentavos, qtd: atual.qtd + 1 });
  }

  const equipe = usuarios.map((u) => {
    const ganhosDoUsuario = ganhosMes.filter((n) => n.responsavelId === u.id);
    const tarefasConcluidasDoUsuario = tarefasConcluidasMes.filter((t) => t.responsavelId === u.id);
    const tarefasAtrasadasDoUsuario = tarefasAtrasadas.filter((t) => t.responsavelId === u.id);
    return {
      id: u.id,
      nome: u.nome,
      ganhosMesQtd: ganhosDoUsuario.length,
      ganhosMesValorCentavos: ganhosDoUsuario.reduce((acc, n) => acc + n.valorCentavos, 0),
      tarefasConcluidasQtd: tarefasConcluidasDoUsuario.length,
      tarefasAtrasadasQtd: tarefasAtrasadasDoUsuario.length,
    };
  });

  return {
    kpis: {
      valorEmNegociacaoCentavos,
      valorGanhoMesCentavos,
      qtdGanhoMes,
      taxaConversao,
      ticketMedioCentavos,
      negociosParadosQtd: negociosParados.length,
      tarefasAtrasadasQtd: tarefasAtrasadas.length,
      aprovacoesPendentesQtd: aprovacoesPendentes.length,
    },
    meta: {
      valorAlvoCentavos: meta?.valorAlvoCentavos ?? 0,
      valorGanhoCentavos: valorGanhoMesCentavos,
      porSemana: Array.from(porSemana.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([semana, dado]) => ({ semana, ...dado })),
      negociosGanhos: ganhosMes.map((n) => ({
        id: n.id,
        titulo: n.titulo,
        contatoNome: n.contato?.nome ?? "Sem contato",
        valorCentavos: n.valorCentavos,
      })),
    },
    funilMini,
    agendaHoje: {
      tarefas: tarefasHoje.map((t) => ({ id: t.id, titulo: t.titulo, negocioTitulo: t.negocio?.titulo ?? null })),
      instalacoes: instalacoesHoje.map((n) => ({ id: n.id, titulo: n.titulo })),
    },
    precisaAtencao,
    producao: {
      emProducaoQtd: emProducao.length,
      progressoMedio: progressoMedioProducao,
      instalacoesSemanaQtd: instalacoesSemana.length,
    },
    equipe,
  };
}

export async function atualizarMetaDoMes(valorCentavos: number): Promise<void> {
  const mes = new Date().getMonth() + 1;
  const ano = new Date().getFullYear();
  await prisma.meta.upsert({
    where: { mes_ano: { mes, ano } },
    update: { valorAlvoCentavos: valorCentavos },
    create: { mes, ano, valorAlvoCentavos: valorCentavos },
  });
}
