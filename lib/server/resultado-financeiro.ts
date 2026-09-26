import "server-only";
import { prisma } from "@/lib/db";
import { calcularResultado, serieMensal, type TransacaoParaResultado } from "@/lib/utils/resultado-financeiro";

// Dados do "Dashboard financeiro" (aba do Financeiro): resultado de CAIXA
// vindo dos extratos importados e do rateio deles entre projetos e centros
// de custo. Pedido de 2026-09-25 — ver lib/utils/resultado-financeiro.ts.

const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export type PeriodoFinanceiro = {
  tipo: "mes" | "ano";
  /** "2026-09" (mês) ou "2026" (ano) */
  chave: string;
  rotulo: string;
  inicio: Date;
  fim: Date;
  anterior: { chave: string; rotulo: string; inicio: Date; fim: Date };
  proximaChave: string;
};

function inicioBrasilia(ano: number, mes: number): Date {
  // mes 1-12; aceita 13 (vira janeiro do ano seguinte) e 0 (dezembro anterior)
  const d = new Date(Date.UTC(ano, mes - 1, 1));
  return new Date(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00-03:00`);
}

function chaveMes(ano: number, mes: number): string {
  const d = new Date(Date.UTC(ano, mes - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function rotuloMes(chave: string): string {
  const [ano, mes] = chave.split("-").map(Number);
  return `${NOMES_MES[mes - 1]} de ${ano}`;
}

/** ?mes=AAAA-MM (padrão: mês atual em Brasília) ou ?ano=AAAA. */
export function resolverPeriodoFinanceiro(params: { mes?: string; ano?: string }): PeriodoFinanceiro {
  if (params.ano && /^\d{4}$/.test(params.ano)) {
    const ano = Number(params.ano);
    return {
      tipo: "ano",
      chave: String(ano),
      rotulo: `ano de ${ano}`,
      inicio: inicioBrasilia(ano, 1),
      fim: inicioBrasilia(ano + 1, 1),
      anterior: { chave: String(ano - 1), rotulo: `ano de ${ano - 1}`, inicio: inicioBrasilia(ano - 1, 1), fim: inicioBrasilia(ano, 1) },
      proximaChave: String(ano + 1),
    };
  }
  const atual = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
  const chave = params.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes) ? params.mes : atual;
  const [ano, mes] = chave.split("-").map(Number);
  const chaveAnterior = chaveMes(ano, mes - 1);
  return {
    tipo: "mes",
    chave,
    rotulo: rotuloMes(chave),
    inicio: inicioBrasilia(ano, mes),
    fim: inicioBrasilia(ano, mes + 1),
    anterior: { chave: chaveAnterior, rotulo: rotuloMes(chaveAnterior), inicio: inicioBrasilia(ano, mes - 1), fim: inicioBrasilia(ano, mes) },
    proximaChave: chaveMes(ano, mes + 1),
  };
}

/** Lançamentos do extrato em [inicio, fim) com o rateio — também usado pelo painel de reunião. */
export async function carregarTransacoes(inicio: Date, fim: Date): Promise<TransacaoParaResultado[]> {
  const transacoes = await prisma.transacaoBancaria.findMany({
    where: { data: { gte: inicio, lt: fim } },
    select: {
      data: true,
      valorCentavos: true,
      tipo: true,
      status: true,
      rateios: {
        select: {
          valorCentavos: true,
          negocioId: true,
          negocio: { select: { titulo: true, contato: { select: { nome: true } } } },
          centroCustoId: true,
          centroCusto: { select: { nome: true } },
        },
      },
    },
  });
  return transacoes.map((t) => ({
    data: t.data,
    valorCentavos: t.valorCentavos,
    tipo: t.tipo,
    status: t.status,
    rateios: t.rateios.map((r) => ({
      valorCentavos: r.valorCentavos,
      negocioId: r.negocioId,
      negocioTitulo: r.negocio?.titulo ?? null,
      contatoNome: r.negocio?.contato?.nome ?? null,
      centroCustoId: r.centroCustoId,
      centroCustoNome: r.centroCusto?.nome ?? null,
    })),
  }));
}

export async function getDashboardFinanceiro(periodo: PeriodoFinanceiro) {
  // Série: os 12 meses do ano escolhido, ou os 12 meses terminando no mês escolhido.
  const [anoRef, mesRef] = periodo.tipo === "ano" ? [Number(periodo.chave), 12] : periodo.chave.split("-").map(Number);
  const meses = Array.from({ length: 12 }, (_, i) => chaveMes(anoRef, mesRef - 11 + i));
  const inicioSerie = inicioBrasilia(anoRef, mesRef - 11);
  const fimSerie = inicioBrasilia(anoRef, mesRef + 1);

  const [transacoesPeriodo, transacoesAnterior, transacoesSerie, ultimoLancamento, ultimaImportacao] = await Promise.all([
    carregarTransacoes(periodo.inicio, periodo.fim),
    carregarTransacoes(periodo.anterior.inicio, periodo.anterior.fim),
    carregarTransacoes(inicioSerie, fimSerie),
    prisma.transacaoBancaria.findFirst({ orderBy: { data: "desc" }, select: { data: true } }),
    prisma.extratoBancarioImportacao.findFirst({ orderBy: { importadoEm: "desc" }, select: { importadoEm: true } }),
  ]);

  const atual = calcularResultado(transacoesPeriodo);
  const anterior = calcularResultado(transacoesAnterior);

  // Projetos do período: completa com valor do negócio (contrato), etapa e
  // quanto já entrou no total (todos os períodos) pra mostrar o que falta receber.
  const ids = atual.projetos.map((p) => p.negocioId);
  const [negocios, recebidoTotal] = ids.length
    ? await Promise.all([
        prisma.negocio.findMany({
          where: { id: { in: ids } },
          select: { id: true, valorCentavos: true, etapa: { select: { nome: true } }, funil: { select: { nome: true } } },
        }),
        prisma.rateioTransacao.groupBy({
          by: ["negocioId"],
          where: { negocioId: { in: ids }, transacao: { tipo: "ENTRADA", status: { not: "IGNORADA" } } },
          _sum: { valorCentavos: true },
        }),
      ])
    : [[], []];
  const negocioPorId = new Map(negocios.map((n) => [n.id, n]));
  const recebidoPorId = new Map(recebidoTotal.map((r) => [r.negocioId, r._sum.valorCentavos ?? 0]));

  return {
    atual,
    anterior,
    serie: serieMensal(transacoesSerie, meses),
    projetos: atual.projetos.map((p) => {
      const negocio = negocioPorId.get(p.negocioId);
      const valorContrato = negocio?.valorCentavos ?? 0;
      return {
        ...p,
        valorContratoCentavos: valorContrato,
        aReceberCentavos: Math.max(valorContrato - (recebidoPorId.get(p.negocioId) ?? 0), 0),
        etapa: negocio ? `${negocio.funil.nome} · ${negocio.etapa.nome}` : null,
      };
    }),
    cobertura: {
      ultimoLancamento: ultimoLancamento?.data ?? null,
      ultimaImportacao: ultimaImportacao?.importadoEm ?? null,
    },
  };
}
