import "server-only";
import { prisma } from "@/lib/db";

const TITULOS_TAREFA_POS_VENDA = ["Emissão de contrato", "Emitir nota fiscal e boleto"];
const ETAPAS_POS_VENDA_ORDEM = ["Contrato", "Pagamento", "Compras", "Produção", "Entrega", "Avaliação"];

function inicioDoMes(offsetMeses = 0): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offsetMeses, 1);
}

function chaveDoMes(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

export async function getPainelFinanceiro() {
  const inicioJanela = inicioDoMes(-5); // janela de 6 meses (mês atual + 5 anteriores)

  const [negociosGanhos, negociosPosVenda, tarefasPendentes] = await Promise.all([
    prisma.negocio.findMany({
      where: { etapa: { tipo: "GANHO" }, dataEntradaNaEtapa: { gte: inicioJanela } },
      include: { contato: true },
    }),
    prisma.negocio.findMany({
      where: { funil: { nome: "Funil de pós-venda" } },
      include: { etapa: true },
    }),
    prisma.tarefa.findMany({
      where: { titulo: { in: TITULOS_TAREFA_POS_VENDA }, status: { not: "CONCLUIDA" } },
      include: { negocio: true, contato: true, responsavel: true },
      orderBy: { prazo: "asc" },
    }),
  ]);

  const porMes = new Map<string, number>();
  for (let i = 5; i >= 0; i--) porMes.set(chaveDoMes(inicioDoMes(-i)), 0);
  for (const n of negociosGanhos) {
    const chave = chaveDoMes(n.dataEntradaNaEtapa);
    if (porMes.has(chave)) porMes.set(chave, (porMes.get(chave) ?? 0) + n.valorCentavos);
  }
  const faturamentoPorMes = Array.from(porMes.entries()).map(([mes, valorCentavos]) => ({ mes, valorCentavos }));

  const mesAtual = faturamentoPorMes[faturamentoPorMes.length - 1];
  const mesAnterior = faturamentoPorMes[faturamentoPorMes.length - 2];
  const variacaoPercentual =
    mesAnterior && mesAnterior.valorCentavos > 0
      ? Math.round(((mesAtual.valorCentavos - mesAnterior.valorCentavos) / mesAnterior.valorCentavos) * 100)
      : null;

  const ticketMedioCentavos =
    negociosGanhos.length > 0 ? Math.round(negociosGanhos.reduce((acc, n) => acc + n.valorCentavos, 0) / negociosGanhos.length) : 0;

  const pipelinePosVenda = ETAPAS_POS_VENDA_ORDEM.map((nome) => {
    const doGrupo = negociosPosVenda.filter((n) => n.etapa.nome === nome);
    return { etapa: nome, quantidade: doGrupo.length, valorCentavos: doGrupo.reduce((acc, n) => acc + n.valorCentavos, 0) };
  });

  const porCliente = new Map<string, { nome: string; valorCentavos: number; qtd: number }>();
  for (const n of negociosGanhos) {
    if (!n.contato) continue;
    const atual = porCliente.get(n.contato.id) ?? { nome: n.contato.nome, valorCentavos: 0, qtd: 0 };
    porCliente.set(n.contato.id, { nome: atual.nome, valorCentavos: atual.valorCentavos + n.valorCentavos, qtd: atual.qtd + 1 });
  }
  const rankingClientes = Array.from(porCliente.values())
    .sort((a, b) => b.valorCentavos - a.valorCentavos)
    .slice(0, 5);

  return {
    faturamentoPorMes,
    faturamentoMesAtualCentavos: mesAtual?.valorCentavos ?? 0,
    variacaoPercentual,
    ticketMedioCentavos,
    negociosGanhosJanelaQtd: negociosGanhos.length,
    pipelinePosVenda,
    pipelinePosVendaValorTotalCentavos: negociosPosVenda.reduce((acc, n) => acc + n.valorCentavos, 0),
    pendenciasPosVenda: tarefasPendentes.map((t) => ({
      id: t.id,
      titulo: t.titulo,
      negocioTitulo: t.negocio?.titulo ?? null,
      negocioId: t.negocioId,
      contatoNome: t.contato?.nome ?? null,
      prazo: t.prazo,
      responsavelNome: t.responsavel.nome,
    })),
    rankingClientes,
  };
}
