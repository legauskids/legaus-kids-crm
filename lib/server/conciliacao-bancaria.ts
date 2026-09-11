import "server-only";
import { prisma } from "@/lib/db";
import { parseOfx, decodificarOfx } from "@/lib/utils/ofx-parser";

/**
 * Importa um extrato OFX: faz o parse, pula transação cujo FITID já foi
 * importado antes (evita duplicar lançamento se o período do extrato novo
 * sobrepor um já importado) e grava o resto como pendente de conciliação.
 */
export async function importarExtratoOfx(input: { nomeArquivo: string; bytes: Buffer; importadoPorId: string }) {
  const conteudo = decodificarOfx(input.bytes);
  const extrato = parseOfx(conteudo);
  if (extrato.transacoes.length === 0) {
    throw new Error("Nenhuma transação encontrada nesse arquivo — confirme que é um extrato OFX válido.");
  }

  const fitIds = extrato.transacoes.map((t) => t.fitId).filter((id): id is string => Boolean(id));
  const jaImportados = fitIds.length
    ? new Set((await prisma.transacaoBancaria.findMany({ where: { fitId: { in: fitIds } }, select: { fitId: true } })).map((t) => t.fitId))
    : new Set<string>();

  const transacoesNovas = extrato.transacoes.filter((t) => !t.fitId || !jaImportados.has(t.fitId));

  const importacao = await prisma.extratoBancarioImportacao.create({
    data: {
      nomeArquivo: input.nomeArquivo,
      periodoInicio: extrato.periodoInicio,
      periodoFim: extrato.periodoFim,
      quantidadeTransacoes: transacoesNovas.length,
      importadoPorId: input.importadoPorId,
      transacoes: {
        create: transacoesNovas.map((t) => ({
          data: t.data,
          descricao: t.descricao,
          valorCentavos: t.valorCentavos,
          tipo: t.tipo,
          fitId: t.fitId,
        })),
      },
    },
  });

  return {
    importacaoId: importacao.id,
    totalNoArquivo: extrato.transacoes.length,
    novasImportadas: transacoesNovas.length,
    duplicadasIgnoradas: extrato.transacoes.length - transacoesNovas.length,
  };
}

export function listImportacoes() {
  return prisma.extratoBancarioImportacao.findMany({
    include: { importadoPor: true, _count: { select: { transacoes: { where: { status: "NAO_CONCILIADA" } } } } },
    orderBy: { importadoEm: "desc" },
  });
}

export type FiltroTransacoes = "NAO_CONCILIADA" | "CONCILIADA" | "IGNORADA" | "TODAS";

export function listTransacoes(filtro: FiltroTransacoes) {
  return prisma.transacaoBancaria.findMany({
    where: filtro === "TODAS" ? undefined : { status: filtro },
    include: { negocio: { include: { contato: true } }, importacao: true },
    orderBy: { data: "desc" },
  });
}

/** Pra popular o seletor de "vincular a um negócio" na tela de conciliação — inclui valorCentavos pra UI priorizar quem bate com o valor da transação. */
export function listNegociosParaConciliacao() {
  return prisma.negocio.findMany({
    select: { id: true, titulo: true, valorCentavos: true, contato: { select: { nome: true } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}

export function conciliarTransacao(transacaoId: string, negocioId: string, usuarioId: string) {
  return prisma.transacaoBancaria.update({
    where: { id: transacaoId },
    data: { status: "CONCILIADA", negocioId, conciliadaPorId: usuarioId, conciliadaEm: new Date() },
  });
}

export function ignorarTransacao(transacaoId: string, usuarioId: string) {
  return prisma.transacaoBancaria.update({
    where: { id: transacaoId },
    data: { status: "IGNORADA", negocioId: null, conciliadaPorId: usuarioId, conciliadaEm: new Date() },
  });
}

/** Volta a transação pra "não conciliada" — desfaz um match ou uma ignorada por engano. */
export function reabrirTransacao(transacaoId: string) {
  return prisma.transacaoBancaria.update({
    where: { id: transacaoId },
    data: { status: "NAO_CONCILIADA", negocioId: null, conciliadaPorId: null, conciliadaEm: null },
  });
}
