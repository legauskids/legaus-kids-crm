import "server-only";
import { Prisma, type StatusItemPauta, type TipoReuniao } from "@prisma/client";
import { prisma } from "@/lib/db";
import { criarTarefa, moverTarefaStatus } from "@/lib/server/tarefas";
import { carregarTransacoes } from "@/lib/server/resultado-financeiro";
import { calcularResultado } from "@/lib/utils/resultado-financeiro";
import { negocioParadoAlemDoPrazo, diasDesde, formatarDataCalendario } from "@/lib/utils/dates";
import {
  dataCalendarioNoIntervalo,
  diaBrasilia,
  periodosDaReuniao,
  rotuloPeriodo,
  tituloPadraoReuniao,
  type CompromissoNoResumo,
  type NegocioNoResumo,
  type PeriodosReuniao,
  type ResumoReuniao,
} from "@/lib/utils/reuniao";

// Painel de reunião semanal/mensal (pedido de 2026-09-25). Aqui ficam o
// resumo com os números do CRM (período analisado + perspectiva do
// próximo) e o CRUD de reunião, pauta, opiniões e compromissos. A parte de
// IA (pauta sugerida e avaliação) está em lib/server/reuniao-ia.ts.

const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const LIMITE_ITENS = 8;

function noIntervalo(data: Date, inicio: Date, fim: Date): boolean {
  return data >= inicio && data < fim;
}

function somar(itens: { valorCentavos: number }[]): number {
  return itens.reduce((acc, n) => acc + n.valorCentavos, 0);
}

function lista(itens: NegocioNoResumo[]): NegocioNoResumo[] {
  return [...itens].sort((a, b) => b.valorCentavos - a.valorCentavos).slice(0, LIMITE_ITENS);
}

export async function montarResumoReuniao(periodos: PeriodosReuniao): Promise<ResumoReuniao> {
  const { periodoInicio, periodoFim, proximoInicio, proximoFim } = periodos;
  const agora = new Date();
  const noPeriodo = { gte: periodoInicio, lt: periodoFim };

  // Mês da meta: o mês do fim do período analisado (semana 21-27/09 → setembro).
  const [anoMeta, mesMeta] = diaBrasilia(new Date(periodoFim.getTime() - 1)).split("-").map(Number);
  const inicioMesMeta = new Date(`${anoMeta}-${String(mesMeta).padStart(2, "0")}-01T00:00:00-03:00`);
  const fimMesMeta = new Date(Date.UTC(anoMeta, mesMeta, 1, 3));
  const [anoProx, mesProx] = diaBrasilia(new Date(proximoFim.getTime() - 1)).split("-").map(Number);

  const [funis, negocios, conversasNovas, contatosNovos, tarefasAbertas, concluidasNoPeriodo, compromissosConcluidos, metas, transacoes, ultimoLancamento] =
    await Promise.all([
      prisma.funil.findMany({ include: { etapas: { orderBy: { ordem: "asc" } } } }),
      prisma.negocio.findMany({
        select: {
          id: true,
          titulo: true,
          funilId: true,
          etapaId: true,
          valorCentavos: true,
          createdAt: true,
          dataEntradaNaEtapa: true,
          previsaoFechamento: true,
          previsaoProducao: true,
          dataInstalacao: true,
          motivoPerda: true,
          contato: { select: { nome: true } },
          etapa: { select: { nome: true, tipo: true, slaDias: true, ordem: true } },
          funil: { select: { nome: true } },
        },
      }),
      prisma.conversa.findMany({
        where: { createdAt: noPeriodo },
        select: { mensagens: { orderBy: { enviadaEm: "asc" }, take: 1, select: { direcao: true } } },
      }),
      prisma.contato.count({ where: { createdAt: noPeriodo } }),
      prisma.tarefa.findMany({
        where: { status: { not: "CONCLUIDA" } },
        select: {
          id: true,
          titulo: true,
          prazo: true,
          status: true,
          reuniaoId: true,
          reuniao: { select: { titulo: true } },
          responsavel: { select: { nome: true } },
        },
        orderBy: { prazo: "asc" },
      }),
      prisma.tarefa.count({ where: { status: "CONCLUIDA", updatedAt: noPeriodo } }),
      prisma.tarefa.count({ where: { status: "CONCLUIDA", updatedAt: noPeriodo, reuniaoId: { not: null } } }),
      prisma.meta.findMany({ where: { OR: [{ mes: mesMeta, ano: anoMeta }, { mes: mesProx, ano: anoProx }] } }),
      carregarTransacoes(periodoInicio, periodoFim),
      prisma.transacaoBancaria.findFirst({ orderBy: { data: "desc" }, select: { data: true } }),
    ]);

  const funilVenda = funis.find((f) => f.nome === "Funil de venda") ?? funis[0];
  const funilPosVenda = funis.find((f) => f.nome === "Funil de pós-venda");
  const etapasNormaisVenda = (funilVenda?.etapas ?? []).filter((e) => e.tipo === "NORMAL");
  // "Fechamento" = última etapa aberta do funil de venda (sobrevive a renomear).
  const etapaFechamento = etapasNormaisVenda[etapasNormaisVenda.length - 1];
  const etapaPagamento = funilPosVenda?.etapas.find((e) => e.nome.toLowerCase() === "pagamento");

  const paraItem = (n: (typeof negocios)[number], detalhe: string | null): NegocioNoResumo => ({
    id: n.id,
    titulo: n.titulo,
    contatoNome: n.contato?.nome ?? null,
    valorCentavos: n.valorCentavos,
    detalhe,
  });

  const daVenda = negocios.filter((n) => n.funilId === funilVenda?.id);
  const ganhos = daVenda.filter((n) => n.etapa.tipo === "GANHO" && noIntervalo(n.dataEntradaNaEtapa, periodoInicio, periodoFim));
  const perdidos = daVenda.filter((n) => n.etapa.tipo === "PERDIDO" && noIntervalo(n.dataEntradaNaEtapa, periodoInicio, periodoFim));
  const novos = daVenda.filter((n) => noIntervalo(n.createdAt, periodoInicio, periodoFim));
  const abertosVenda = daVenda.filter((n) => n.etapa.tipo === "NORMAL");
  const emFechamento = abertosVenda.filter((n) => n.etapaId === etapaFechamento?.id);
  const hoje = diaBrasilia(agora);
  const vencidos = abertosVenda.filter((n) => n.previsaoFechamento && n.previsaoFechamento.toISOString().slice(0, 10) < hoje);
  const previstos = abertosVenda.filter((n) => n.previsaoFechamento && dataCalendarioNoIntervalo(n.previsaoFechamento, proximoInicio, proximoFim));

  const abertosTodos = negocios.filter((n) => n.etapa.tipo === "NORMAL");
  const parados = abertosTodos.filter((n) => negocioParadoAlemDoPrazo({ slaDias: n.etapa.slaDias, dataEntradaNaEtapa: n.dataEntradaNaEtapa }));
  const instalacoes = negocios.filter((n) => n.dataInstalacao && dataCalendarioNoIntervalo(n.dataInstalacao, proximoInicio, proximoFim));
  const producao = negocios.filter((n) => n.previsaoProducao && dataCalendarioNoIntervalo(n.previsaoProducao, proximoInicio, proximoFim));
  const abertosPosVenda = funilPosVenda ? abertosTodos.filter((n) => n.funilId === funilPosVenda.id) : [];
  const emPagamento = abertosPosVenda.filter((n) => n.etapaId === etapaPagamento?.id);

  const ganhosMesMeta = daVenda.filter((n) => n.etapa.tipo === "GANHO" && noIntervalo(n.dataEntradaNaEtapa, inicioMesMeta, fimMesMeta));
  const meta = metas.find((m) => m.mes === mesMeta && m.ano === anoMeta);
  const metaProx = mesProx !== mesMeta || anoProx !== anoMeta ? metas.find((m) => m.mes === mesProx && m.ano === anoProx) : undefined;
  const duracaoMes = fimMesMeta.getTime() - inicioMesMeta.getTime();
  const percentualDoMes = Math.round(Math.min(Math.max((agora.getTime() - inicioMesMeta.getTime()) / duracaoMes, 0), 1) * 100);

  const financeiro = calcularResultado(transacoes);
  const mesFinanceiro = diaBrasilia(new Date(periodoFim.getTime() - 1)).slice(0, 7);

  const compromissosAbertos: CompromissoNoResumo[] = tarefasAbertas
    .filter((t) => t.reuniaoId)
    .map((t) => ({
      id: t.id,
      titulo: t.titulo,
      responsavelNome: t.responsavel.nome,
      prazo: t.prazo.toISOString(),
      status: t.status,
      atrasado: t.prazo < agora,
      reuniaoId: t.reuniaoId,
      reuniaoTitulo: t.reuniao?.titulo ?? null,
    }));

  const etapasComTotais = (etapas: { id: string; nome: string; tipo: string }[]) =>
    etapas
      .filter((e) => e.tipo === "NORMAL")
      .map((e) => {
        const daEtapa = abertosTodos.filter((n) => n.etapaId === e.id);
        return { etapaId: e.id, nome: e.nome, qtd: daEtapa.length, valorCentavos: somar(daEtapa) };
      });

  const hrefFunil = (id: string | undefined) => (id ? `/negocios?funil=${id}` : "/negocios");

  return {
    geradoEm: agora.toISOString(),
    periodo: { inicio: periodoInicio.toISOString(), fim: periodoFim.toISOString(), rotulo: rotuloPeriodo(periodoInicio, periodoFim) },
    proximo: { inicio: proximoInicio.toISOString(), fim: proximoFim.toISOString(), rotulo: rotuloPeriodo(proximoInicio, proximoFim) },
    links: {
      funilVenda: hrefFunil(funilVenda?.id),
      funilPosVenda: hrefFunil(funilPosVenda?.id),
      parados: "/negocios?parados=1",
      tarefasAtrasadas: "/tarefas?status=ATRASADA",
      aprovacoes: "/tarefas?status=APROVACAO",
      financeiro: `/financeiro?aba=dashboard&mes=${mesFinanceiro}`,
      conciliacao: "/financeiro?aba=conciliacao",
      producao: "/producao",
      atendimento: "/atendimento",
      dashboard: "/",
    },
    vendas: {
      ganhos: { qtd: ganhos.length, valorCentavos: somar(ganhos), itens: lista(ganhos.map((n) => paraItem(n, null))) },
      perdidos: {
        qtd: perdidos.length,
        valorCentavos: somar(perdidos),
        itens: lista(perdidos.map((n) => paraItem(n, n.motivoPerda ?? "sem motivo registrado"))),
      },
      novosNegocios: { qtd: novos.length, valorCentavos: somar(novos) },
      leads: {
        conversasNovas: conversasNovas.filter((c) => c.mensagens[0]?.direcao === "ENTRADA").length,
        contatosNovos,
      },
    },
    pipeline: {
      emNegociacao: { qtd: abertosVenda.length, valorCentavos: somar(abertosVenda) },
      emFechamento: {
        qtd: emFechamento.length,
        valorCentavos: somar(emFechamento),
        itens: lista(
          emFechamento.map((n) =>
            paraItem(n, n.previsaoFechamento ? `previsão ${formatarDataCalendario(n.previsaoFechamento)}` : "sem previsão de fechamento"),
          ),
        ),
      },
      parados: {
        qtd: parados.length,
        valorCentavos: somar(parados),
        itens: lista(parados.map((n) => paraItem(n, `${n.funil.nome} · ${n.etapa.nome} há ${diasDesde(n.dataEntradaNaEtapa)} dias`))),
      },
      previsaoVencida: {
        qtd: vencidos.length,
        valorCentavos: somar(vencidos),
        itens: lista(vencidos.map((n) => paraItem(n, `previsão ${formatarDataCalendario(n.previsaoFechamento!)}`))),
      },
      etapas: etapasComTotais(funilVenda?.etapas ?? []),
    },
    meta: meta
      ? {
          rotuloMes: NOMES_MES[mesMeta - 1],
          alvoCentavos: meta.valorAlvoCentavos,
          ganhoCentavos: somar(ganhosMesMeta),
          percentualAtingido: meta.valorAlvoCentavos > 0 ? Math.round((somar(ganhosMesMeta) / meta.valorAlvoCentavos) * 100) : 0,
          percentualDoMes,
        }
      : null,
    financeiro: {
      entradasCentavos: financeiro.entradasCentavos,
      saidasCentavos: financeiro.saidasCentavos,
      resultadoCentavos: financeiro.resultadoCentavos,
      aClassificarQtd: financeiro.aClassificar.lancamentos,
      aClassificarCentavos: financeiro.aClassificar.entradasCentavos + financeiro.aClassificar.saidasCentavos,
      ultimoLancamento: ultimoLancamento?.data.toISOString() ?? null,
    },
    posVenda: {
      etapas: etapasComTotais(funilPosVenda?.etapas ?? []),
      emPagamento: { qtd: emPagamento.length, valorCentavos: somar(emPagamento) },
    },
    tarefas: {
      concluidasNoPeriodo,
      atrasadas: tarefasAbertas.filter((t) => t.prazo < agora).length,
      aprovacoesPendentes: tarefasAbertas.filter((t) => t.status === "APROVACAO").length,
    },
    compromissos: { abertos: compromissosAbertos, concluidosNoPeriodo: compromissosConcluidos },
    perspectiva: {
      fechamentosPrevistos: {
        qtd: previstos.length,
        valorCentavos: somar(previstos),
        itens: lista(previstos.map((n) => paraItem(n, `previsão ${formatarDataCalendario(n.previsaoFechamento!)}`))),
      },
      emFechamentoSemPrevisao: emFechamento.filter((n) => !n.previsaoFechamento).length,
      instalacoes: {
        qtd: instalacoes.length,
        itens: lista(instalacoes.map((n) => paraItem(n, `instalação ${formatarDataCalendario(n.dataInstalacao!)}`))),
      },
      producaoPrevista: {
        qtd: producao.length,
        itens: lista(producao.map((n) => paraItem(n, `produção até ${formatarDataCalendario(n.previsaoProducao!)}`))),
      },
      tarefasComPrazo: tarefasAbertas.filter((t) => noIntervalo(t.prazo, proximoInicio, proximoFim)).length,
      compromissosVencendo: compromissosAbertos.filter((c) => noIntervalo(new Date(c.prazo), proximoInicio, proximoFim)).length,
      metaProximoMesCentavos: metaProx?.valorAlvoCentavos ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Reuniões
// ---------------------------------------------------------------------------

export function listReunioes() {
  return prisma.reuniao.findMany({
    orderBy: { data: "desc" },
    take: 60,
    include: {
      _count: { select: { itensPauta: true, compromissos: true } },
      compromissos: { select: { status: true } },
    },
  });
}

export function getReuniao(id: string) {
  return prisma.reuniao.findUnique({
    where: { id },
    include: {
      criadoPor: { select: { nome: true } },
      itensPauta: {
        orderBy: { ordem: "asc" },
        include: { opinioes: { orderBy: { criadoEm: "asc" }, include: { autor: { select: { id: true, nome: true } } } } },
      },
      compromissos: {
        orderBy: { prazo: "asc" },
        include: { responsavel: { select: { id: true, nome: true } } },
      },
    },
  });
}

export type ReuniaoDetalhada = NonNullable<Awaited<ReturnType<typeof getReuniao>>>;

/** Última reunião encerrada antes desta data — a avaliação dela alimenta a próxima pauta. */
export function getReuniaoAnteriorEncerrada(antesDe: Date, excetoId?: string) {
  return prisma.reuniao.findFirst({
    where: { status: "ENCERRADA", data: { lt: antesDe }, ...(excetoId ? { id: { not: excetoId } } : {}) },
    orderBy: { data: "desc" },
    include: { itensPauta: { orderBy: { ordem: "asc" } }, compromissos: { include: { responsavel: { select: { nome: true } } } } },
  });
}

/**
 * Traz pra pauta o que ficou pendente ou adiado na última reunião encerrada
 * (origem PENDENTE_ANTERIOR) — é isso que fecha o ciclo de uma reunião pra
 * outra. Idempotente (itemAnteriorId): roda ao criar a reunião e de novo ao
 * sugerir a pauta, pro caso de a anterior ter sido encerrada depois.
 */
export async function trazerPendentesDaAnterior(reuniaoId: string): Promise<number> {
  const reuniao = await prisma.reuniao.findUniqueOrThrow({
    where: { id: reuniaoId },
    include: { itensPauta: { select: { itemAnteriorId: true, ordem: true } } },
  });
  const anterior = await getReuniaoAnteriorEncerrada(reuniao.data, reuniao.id);
  if (!anterior) return 0;
  const jaTrazidos = new Set(reuniao.itensPauta.map((i) => i.itemAnteriorId).filter(Boolean));
  const pendentes = anterior.itensPauta.filter((i) => i.status !== "DISCUTIDO" && !jaTrazidos.has(i.id));
  const ordemInicial = reuniao.itensPauta.reduce((max, i) => Math.max(max, i.ordem), -1) + 1;
  await prisma.itemPauta.createMany({
    data: pendentes.map((i, idx) => ({
      reuniaoId,
      ordem: ordemInicial + idx,
      titulo: i.titulo,
      descricao: [i.descricao, `Ficou ${i.status === "ADIADO" ? "adiado" : "sem discutir"} em "${anterior.titulo}".`].filter(Boolean).join("\n"),
      origem: "PENDENTE_ANTERIOR" as const,
      link: i.link,
      itemAnteriorId: i.id,
    })),
  });
  return pendentes.length;
}

/** Cria a reunião com os períodos calculados e já com os pendentes da anterior na pauta. */
export async function criarReuniao(input: { tipo: TipoReuniao; data: Date; titulo?: string | null }, criadoPorId: string) {
  const reuniao = await prisma.reuniao.create({
    data: {
      tipo: input.tipo,
      titulo: input.titulo?.trim() || tituloPadraoReuniao(input.tipo, input.data),
      data: input.data,
      ...periodosDaReuniao(input.tipo, input.data),
      criadoPorId,
    },
  });
  await trazerPendentesDaAnterior(reuniao.id);
  return reuniao;
}

export async function atualizarReuniao(
  id: string,
  dados: { titulo?: string; data?: Date; anotacoes?: string | null; avaliacao?: string | null },
) {
  const reuniao = await prisma.reuniao.findUniqueOrThrow({ where: { id } });
  const data: Prisma.ReuniaoUpdateInput = {};
  if (dados.titulo !== undefined) {
    if (!dados.titulo.trim()) throw new Error("O título não pode ficar vazio.");
    data.titulo = dados.titulo.trim();
  }
  if (dados.anotacoes !== undefined) data.anotacoes = dados.anotacoes?.trim() || null;
  if (dados.avaliacao !== undefined) data.avaliacao = dados.avaliacao?.trim() || null;
  if (dados.data !== undefined) {
    if (reuniao.status === "ENCERRADA") throw new Error("Reunião encerrada não muda de data — reabra antes.");
    data.data = dados.data;
    Object.assign(data, periodosDaReuniao(reuniao.tipo, dados.data));
  }
  await prisma.reuniao.update({ where: { id }, data });
}

/** Encerra e grava a foto dos números vistos na reunião. A avaliação da IA vem depois (reuniao-ia.ts). */
export async function encerrarReuniao(id: string) {
  const reuniao = await prisma.reuniao.findUniqueOrThrow({ where: { id } });
  if (reuniao.status === "ENCERRADA") return;
  const resumo = await montarResumoReuniao(reuniao);
  await prisma.reuniao.update({
    where: { id },
    data: { status: "ENCERRADA", encerradaEm: new Date(), resumoEncerramento: resumo as unknown as Prisma.InputJsonValue },
  });
}

export async function reabrirReuniao(id: string) {
  await prisma.reuniao.update({ where: { id }, data: { status: "AGENDADA", encerradaEm: null, resumoEncerramento: Prisma.DbNull } });
}

/** Os compromissos continuam como tarefas (só perdem o vínculo com a reunião). */
export async function excluirReuniao(id: string) {
  await prisma.reuniao.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Pauta
// ---------------------------------------------------------------------------

async function proximaOrdem(reuniaoId: string): Promise<number> {
  const ultimo = await prisma.itemPauta.findFirst({ where: { reuniaoId }, orderBy: { ordem: "desc" }, select: { ordem: true } });
  return (ultimo?.ordem ?? -1) + 1;
}

export async function adicionarItemPauta(reuniaoId: string, input: { titulo: string; descricao?: string | null; link?: string | null }) {
  if (!input.titulo.trim()) throw new Error("Escreva o assunto do item.");
  return prisma.itemPauta.create({
    data: {
      reuniaoId,
      ordem: await proximaOrdem(reuniaoId),
      titulo: input.titulo.trim(),
      descricao: input.descricao?.trim() || null,
      link: input.link?.trim() || null,
      origem: "MANUAL",
    },
  });
}

export async function atualizarItemPauta(
  itemId: string,
  dados: { titulo?: string; descricao?: string | null; status?: StatusItemPauta; decisao?: string | null },
) {
  const data: Prisma.ItemPautaUpdateInput = {};
  if (dados.titulo !== undefined) {
    if (!dados.titulo.trim()) throw new Error("O assunto não pode ficar vazio.");
    data.titulo = dados.titulo.trim();
  }
  if (dados.descricao !== undefined) data.descricao = dados.descricao?.trim() || null;
  if (dados.decisao !== undefined) data.decisao = dados.decisao?.trim() || null;
  if (dados.status !== undefined) data.status = dados.status;
  const item = await prisma.itemPauta.update({ where: { id: itemId }, data });
  return item.reuniaoId;
}

export async function excluirItemPauta(itemId: string) {
  const item = await prisma.itemPauta.delete({ where: { id: itemId } });
  return item.reuniaoId;
}

export async function moverItemPauta(itemId: string, direcao: "cima" | "baixo") {
  const item = await prisma.itemPauta.findUniqueOrThrow({ where: { id: itemId } });
  const itens = await prisma.itemPauta.findMany({ where: { reuniaoId: item.reuniaoId }, orderBy: { ordem: "asc" } });
  const idx = itens.findIndex((i) => i.id === itemId);
  const alvo = direcao === "cima" ? idx - 1 : idx + 1;
  if (alvo < 0 || alvo >= itens.length) return item.reuniaoId;
  [itens[idx], itens[alvo]] = [itens[alvo], itens[idx]];
  await prisma.$transaction(itens.map((i, ordem) => prisma.itemPauta.update({ where: { id: i.id }, data: { ordem } })));
  return item.reuniaoId;
}

export async function adicionarOpiniao(itemId: string, autorId: string, texto: string) {
  if (!texto.trim()) throw new Error("Escreva a opinião.");
  const opiniao = await prisma.opiniaoPauta.create({
    data: { itemId, autorId, texto: texto.trim() },
    include: { item: { select: { reuniaoId: true } } },
  });
  return opiniao.item.reuniaoId;
}

export async function excluirOpiniao(opiniaoId: string, usuario: { id: string; isAdmin: boolean }) {
  const opiniao = await prisma.opiniaoPauta.findUniqueOrThrow({ where: { id: opiniaoId }, include: { item: { select: { reuniaoId: true } } } });
  if (opiniao.autorId !== usuario.id && !usuario.isAdmin) throw new Error("Só quem escreveu pode apagar a opinião.");
  await prisma.opiniaoPauta.delete({ where: { id: opiniaoId } });
  return opiniao.item.reuniaoId;
}

// ---------------------------------------------------------------------------
// Compromissos (tarefas com reuniaoId)
// ---------------------------------------------------------------------------

export async function criarCompromisso(
  reuniaoId: string,
  input: { titulo: string; responsavelId: string; prazo: Date; descricao?: string | null },
  solicitanteId: string,
) {
  if (!input.titulo.trim()) throw new Error("Diga o que foi combinado.");
  if (!input.responsavelId) throw new Error("Escolha quem ficou responsável.");
  const reuniao = await prisma.reuniao.findUniqueOrThrow({ where: { id: reuniaoId }, select: { titulo: true } });
  return criarTarefa({
    titulo: input.titulo.trim(),
    responsavelId: input.responsavelId,
    solicitanteId,
    prazo: input.prazo,
    descricao: input.descricao?.trim() || `Compromisso firmado na ${reuniao.titulo}.`,
    reuniaoId,
  });
}

export async function alternarCompromisso(tarefaId: string) {
  const tarefa = await prisma.tarefa.findUniqueOrThrow({ where: { id: tarefaId }, select: { status: true } });
  await moverTarefaStatus(tarefaId, tarefa.status === "CONCLUIDA" ? "A_FAZER" : "CONCLUIDA");
}
