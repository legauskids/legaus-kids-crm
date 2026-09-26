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
      await conciliarTransacao(t.id, escolhido.id, usuarioId);
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
    include: {
      negocio: { include: { contato: true } },
      importacao: true,
      rateios: {
        include: { negocio: { select: { titulo: true } }, centroCusto: { select: { nome: true } } },
        orderBy: { valorCentavos: "desc" },
      },
    },
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

/** Vincula o lançamento inteiro (100%) a um negócio/projeto. */
export function conciliarTransacao(transacaoId: string, negocioId: string, usuarioId: string) {
  return salvarRateio(transacaoId, [{ negocioId }], usuarioId);
}

/** Classifica o lançamento inteiro (100%) num centro de custo. */
export function classificarEmCentroCusto(transacaoId: string, centroCustoId: string, usuarioId: string) {
  return salvarRateio(transacaoId, [{ centroCustoId }], usuarioId);
}

export function ignorarTransacao(transacaoId: string, usuarioId: string) {
  return prisma.$transaction([
    prisma.rateioTransacao.deleteMany({ where: { transacaoId } }),
    prisma.transacaoBancaria.update({
      where: { id: transacaoId },
      data: { status: "IGNORADA", negocioId: null, conciliadaPorId: usuarioId, conciliadaEm: new Date() },
    }),
  ]);
}

/** Volta a transação pra "não conciliada" — desfaz um match, um rateio ou uma ignorada por engano. */
export function reabrirTransacao(transacaoId: string) {
  return prisma.$transaction([
    prisma.rateioTransacao.deleteMany({ where: { transacaoId } }),
    prisma.transacaoBancaria.update({
      where: { id: transacaoId },
      data: { status: "NAO_CONCILIADA", negocioId: null, conciliadaPorId: null, conciliadaEm: null },
    }),
  ]);
}

export type LinhaRateio = {
  negocioId?: string | null;
  centroCustoId?: string | null;
  /** Sem valor = o que falta pra completar o lançamento (usado no "100%"). */
  valorCentavos?: number;
  observacao?: string | null;
};

/**
 * Substitui a divisão (rateio) de um lançamento do extrato entre projetos
 * (negócios) e centros de custo. Cada linha tem exatamente um destino; a
 * soma não pode passar do valor do lançamento. Somando o total, a transação
 * vira CONCILIADA; faltando parte, fica NAO_CONCILIADA com o que já foi
 * classificado (o resto aparece como "a classificar"). negocioId da
 * transação continua apontando pro projeto com a maior parte, pra telas
 * antigas que só mostram um vínculo.
 */
export async function salvarRateio(transacaoId: string, linhas: LinhaRateio[], usuarioId: string) {
  const transacao = await prisma.transacaoBancaria.findUnique({ where: { id: transacaoId } });
  if (!transacao) throw new Error("Lançamento não encontrado.");

  let restante = transacao.valorCentavos;
  const normalizadas = linhas.map((l, i) => {
    const temNegocio = Boolean(l.negocioId);
    const temCentro = Boolean(l.centroCustoId);
    if (temNegocio === temCentro) throw new Error(`Linha ${i + 1}: escolha um projeto OU um centro de custo.`);
    const valor = l.valorCentavos ?? restante;
    if (!Number.isInteger(valor) || valor <= 0) throw new Error(`Linha ${i + 1}: informe um valor maior que zero.`);
    restante -= valor;
    return {
      transacaoId,
      valorCentavos: valor,
      negocioId: l.negocioId || null,
      centroCustoId: l.centroCustoId || null,
      observacao: l.observacao?.trim() || null,
    };
  });
  if (restante < 0) {
    throw new Error(`A divisão passa do valor do lançamento em ${(-restante / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`);
  }

  const completo = normalizadas.length > 0 && restante === 0;
  const principal = [...normalizadas].filter((l) => l.negocioId).sort((a, b) => b.valorCentavos - a.valorCentavos)[0];

  await prisma.$transaction([
    prisma.rateioTransacao.deleteMany({ where: { transacaoId } }),
    ...(normalizadas.length ? [prisma.rateioTransacao.createMany({ data: normalizadas })] : []),
    prisma.transacaoBancaria.update({
      where: { id: transacaoId },
      data: completo
        ? { status: "CONCILIADA", negocioId: principal?.negocioId ?? null, conciliadaPorId: usuarioId, conciliadaEm: new Date() }
        : { status: "NAO_CONCILIADA", negocioId: principal?.negocioId ?? null, conciliadaPorId: null, conciliadaEm: null },
    }),
  ]);
  return { completo, restanteCentavos: restante };
}
