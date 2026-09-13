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
    include: { transacoes: true },
  });

  const { conciliadas } = await conciliarAutomaticamente(
    importacao.transacoes.map((t) => t.id),
    input.importadoPorId,
  );

  return {
    importacaoId: importacao.id,
    totalNoArquivo: extrato.transacoes.length,
    novasImportadas: transacoesNovas.length,
    duplicadasIgnoradas: extrato.transacoes.length - transacoesNovas.length,
    conciliadasAutomaticamente: conciliadas,
  };
}

const REGEX_DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");

function normalizarTexto(s: string): string {
  return s.normalize("NFD").replace(REGEX_DIACRITICOS, "").toUpperCase();
}

/**
 * Concilia automaticamente as transações recém-importadas que têm um match
 * INEQUÍVOCO com um negócio em aberto: mesmo valor exato — e se mais de um
 * negócio tiver esse valor, só desempata quando uma palavra do nome do
 * cliente aparece na descrição do lançamento (comum em PIX/TED, que trazem
 * o nome de quem mandou). Ambíguo ou sem nenhum match fica como estava
 * (NAO_CONCILIADA) pra revisão manual — errar uma conciliação automática
 * (dinheiro atribuído ao negócio errado) é bem pior que deixar pendente.
 * Só considera ENTRADA: negócio representa venda (dinheiro recebido), não
 * faz sentido casar uma SAÍDA (despesa) com ele.
 */
export async function conciliarAutomaticamente(transacaoIds: string[], usuarioId: string): Promise<{ conciliadas: number; pendentes: number }> {
  if (transacaoIds.length === 0) return { conciliadas: 0, pendentes: 0 };

  const transacoes = await prisma.transacaoBancaria.findMany({
    where: { id: { in: transacaoIds }, status: "NAO_CONCILIADA", tipo: "ENTRADA" },
  });
  if (transacoes.length === 0) return { conciliadas: 0, pendentes: 0 };

  const negocios = await prisma.negocio.findMany({
    where: { valorCentavos: { in: [...new Set(transacoes.map((t) => t.valorCentavos))] } },
    include: { contato: true },
  });

  let conciliadas = 0;
  for (const t of transacoes) {
    const candidatos = negocios.filter((n) => n.valorCentavos === t.valorCentavos);
    let escolhido = candidatos.length === 1 ? candidatos[0] : null;

    if (!escolhido && candidatos.length > 1) {
      const descricaoNormalizada = normalizarTexto(t.descricao);
      const comNomeNaDescricao = candidatos.filter((n) => {
        if (!n.contato) return false;
        const palavras = normalizarTexto(n.contato.nome)
          .split(/\s+/)
          .filter((p) => p.length >= 4);
        return palavras.some((p) => descricaoNormalizada.includes(p));
      });
      if (comNomeNaDescricao.length === 1) escolhido = comNomeNaDescricao[0];
    }

    if (escolhido) {
      await prisma.transacaoBancaria.update({
        where: { id: t.id },
        data: { status: "CONCILIADA", negocioId: escolhido.id, conciliadaPorId: usuarioId, conciliadaEm: new Date() },
      });
      conciliadas++;
    }
  }

  return { conciliadas, pendentes: transacoes.length - conciliadas };
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
