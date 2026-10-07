import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { parseOfx, decodificarOfx } from "@/lib/utils/ofx-parser";
import { diaBrasilia } from "@/lib/utils/brasilia";
import { sugerirCentroCusto } from "@/lib/utils/centro-custo";
import { candidatosDaLinha, negocioSugeridoParaEntrada } from "@/lib/utils/pares-despesa";
import { pendenciasDaDespesa, validarCentro } from "@/lib/utils/despesas";

// Conciliação do extrato (OFX do Sicredi) com despesas registradas antes e
// com projetos/categorias. Desde 2026-10-07 NADA é conciliado sozinho: a
// importação só grava as linhas, e a tela mostra prováveis pares (saídas x
// despesas) e o negócio sugerido (entradas) pra o usuário confirmar.

// Cliente de dentro de prisma.$transaction(async (tx) => ...) — vem do
// cliente estendido de lib/db.ts, por isso não é o Prisma.TransactionClient.
type Tx = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/**
 * Importa um extrato OFX: faz o parse, pula transação cujo FITID já foi
 * importado antes (evita duplicar lançamento se o período do extrato novo
 * sobrepor um já importado) e grava o resto como pendente de conciliação.
 * Devolve quantas linhas novas já têm sugestão esperando confirmação.
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

  const [despesas, negocios] = await Promise.all([listDespesasParaPar(), listNegociosParaConciliacao()]);
  const negociosVM = negocios.map((n) => ({ id: n.id, valorCentavos: n.valorCentavos, contatoNome: n.contato?.nome ?? null }));
  let paresProvaveis = 0;
  let entradasComSugestao = 0;
  for (const t of importacao.transacoes) {
    const linha = { id: t.id, dia: diaBrasilia(t.data), descricao: t.descricao, valorCentavos: t.valorCentavos, tipo: t.tipo };
    if (t.tipo === "SAIDA" && candidatosDaLinha(linha, despesas).length > 0) paresProvaveis++;
    if (t.tipo === "ENTRADA" && negocioSugeridoParaEntrada(linha, negociosVM)) entradasComSugestao++;
  }

  return {
    importacaoId: importacao.id,
    totalNoArquivo: extrato.transacoes.length,
    novasImportadas: transacoesNovas.length,
    duplicadasIgnoradas: extrato.transacoes.length - transacoesNovas.length,
    paresProvaveis,
    entradasComSugestao,
  };
}

export function listImportacoes() {
  return prisma.extratoBancarioImportacao.findMany({
    include: { importadoPor: true, _count: { select: { transacoes: { where: { status: "NAO_CONCILIADA" } } } } },
    orderBy: { importadoEm: "desc" },
  });
}

const SELECT_DESPESA_PAR = {
  id: true,
  data: true,
  valorCentavos: true,
  fornecedor: true,
  origem: true,
  categoria: { select: { nome: true } },
  centroGeral: { select: { nome: true } },
  negocioId: true,
  negocio: { select: { titulo: true } },
} satisfies Prisma.DespesaSelect;

async function listDespesasParaPar() {
  const despesas = await prisma.despesa.findMany({ where: { status: "AGUARDANDO_CONCILIACAO" }, select: SELECT_DESPESA_PAR });
  return despesas.map((d) => ({ ...d, dia: diaBrasilia(d.data) }));
}

/**
 * Tudo que a tela de conciliação precisa: linhas pendentes, linhas resolvidas
 * a partir de `resolvidosDesde` (pela data do lançamento), despesas
 * aguardando (pros pares) e os pares já descartados.
 */
export async function getPainelConciliacao(resolvidosDesde: Date | null) {
  const includeLinha = {
    rateios: {
      include: { negocio: { select: { titulo: true } }, centroCusto: { select: { nome: true } }, centroGeral: { select: { nome: true } } },
      orderBy: { valorCentavos: "desc" },
    },
    despesa: { select: SELECT_DESPESA_PAR },
    paresRejeitados: { select: { despesaId: true } },
  } satisfies Prisma.TransacaoBancariaInclude;

  const [pendentes, resolvidos, despesas] = await Promise.all([
    prisma.transacaoBancaria.findMany({ where: { status: "NAO_CONCILIADA" }, include: includeLinha, orderBy: { data: "desc" } }),
    prisma.transacaoBancaria.findMany({
      where: { status: { in: ["CONCILIADA", "IGNORADA"] }, ...(resolvidosDesde ? { data: { gte: resolvidosDesde } } : {}) },
      include: includeLinha,
      orderBy: { data: "desc" },
    }),
    listDespesasParaPar(),
  ]);
  return { pendentes, resolvidos, despesas };
}

/** Pra popular o seletor de "vincular a um negócio" na tela de conciliação — inclui valorCentavos pra sugerir quem bate com o valor da transação. */
export function listNegociosParaConciliacao() {
  return prisma.negocio.findMany({
    select: { id: true, titulo: true, valorCentavos: true, contato: { select: { nome: true } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}

/** Rateio de 100% que uma despesa gera: o projeto, ou a categoria com o centro geral. */
function rateioDaDespesa(d: { categoriaId: string | null; centroGeralId: string | null; negocioId: string | null }): LinhaRateio {
  if (d.negocioId) return { negocioId: d.negocioId };
  if (!d.categoriaId) throw new Error("A despesa está sem categoria — edite em Financeiro → Despesas antes de confirmar.");
  return { centroCustoId: d.categoriaId, centroGeralId: d.centroGeralId };
}

async function linhaPendente(tx: Tx, transacaoId: string, tipo?: "ENTRADA" | "SAIDA") {
  const transacao = await tx.transacaoBancaria.findUnique({ where: { id: transacaoId }, include: { despesa: { select: { id: true } } } });
  if (!transacao) throw new Error("Lançamento não encontrado.");
  if (transacao.status !== "NAO_CONCILIADA") throw new Error("Esse lançamento já foi resolvido — atualize a tela.");
  if (transacao.despesa) throw new Error("Esse lançamento já tem uma despesa vinculada.");
  if (tipo && transacao.tipo !== tipo) throw new Error(tipo === "SAIDA" ? "Esse lançamento não é uma saída." : "Esse lançamento não é uma entrada.");
  return transacao;
}

/**
 * "Confirmar par": vincula a despesa JÁ registrada à linha do extrato — não
 * cria despesa nova. Uma despesa por linha (transacaoId único) e só despesa
 * aguardando, com o mesmo valor exato.
 */
export async function confirmarPar(transacaoId: string, despesaId: string, usuarioId: string) {
  await prisma.$transaction(async (tx) => {
    const transacao = await linhaPendente(tx, transacaoId, "SAIDA");
    const despesa = await tx.despesa.findUnique({ where: { id: despesaId } });
    if (!despesa) throw new Error("Despesa não encontrada.");
    if (despesa.status !== "AGUARDANDO_CONCILIACAO" || despesa.transacaoId) throw new Error("Essa despesa já foi conciliada ou ainda não foi confirmada.");
    if (despesa.valorCentavos !== transacao.valorCentavos) throw new Error("O valor da despesa é diferente do valor do extrato.");

    const vinculadas = await tx.despesa.updateMany({
      where: { id: despesaId, status: "AGUARDANDO_CONCILIACAO", transacaoId: null },
      data: { transacaoId, status: "CONCILIADA", conciliadaEm: new Date() },
    });
    if (vinculadas.count !== 1) throw new Error("Essa despesa acabou de ser conciliada em outro lançamento.");
    await gravarRateio(tx, transacao, [rateioDaDespesa(despesa)], usuarioId);
  });
}

/** "Não é esse": a despesa não volta a ser sugerida pra essa linha. */
export async function rejeitarPar(transacaoId: string, despesaId: string, usuarioId: string) {
  await prisma.parRejeitado.upsert({
    where: { transacaoId_despesaId: { transacaoId, despesaId } },
    create: { transacaoId, despesaId, rejeitadoPorId: usuarioId },
    update: {},
  });
}

/**
 * Saída do extrato sem despesa registrada: classifica na hora criando a
 * despesa (origem EXTRATO) já conciliada com a linha.
 */
export async function classificarSaida(
  transacaoId: string,
  dados: { fornecedor: string; categoriaId: string | null; centroGeralId: string | null; negocioId: string | null },
  usuarioId: string,
) {
  validarCentro(dados);
  await prisma.$transaction(async (tx) => {
    const transacao = await linhaPendente(tx, transacaoId, "SAIDA");
    const campos = {
      valorCentavos: transacao.valorCentavos,
      fornecedor: dados.fornecedor.trim(),
      categoriaId: dados.categoriaId || null,
      centroGeralId: dados.centroGeralId || null,
      negocioId: dados.negocioId || null,
    };
    const faltando = pendenciasDaDespesa(campos);
    if (faltando.length) throw new Error(`Falta informar: ${faltando.join(", ")}.`);
    const agora = new Date();
    await tx.despesa.create({
      data: {
        ...campos,
        data: transacao.data,
        origem: "EXTRATO",
        status: "CONCILIADA",
        transacaoId,
        textoOriginal: transacao.descricao,
        registradaPorId: usuarioId,
        confirmadaEm: agora,
        conciliadaEm: agora,
      },
    });
    await gravarRateio(tx, transacao, [rateioDaDespesa(campos)], usuarioId);
  });
}

/**
 * Entrada: vincula ao negócio de origem ou a um centro geral. No centro
 * geral, a categoria de receita vem das palavras-chave ou é a primeira de
 * receita ("Outras receitas") — dá pra trocar depois em "Editar divisão".
 */
export async function classificarEntrada(transacaoId: string, destino: { negocioId: string | null; centroGeralId: string | null }, usuarioId: string) {
  validarCentro(destino);
  if (!destino.negocioId && !destino.centroGeralId) throw new Error("Escolha o negócio ou o centro de custo.");
  await prisma.$transaction(async (tx) => {
    const transacao = await linhaPendente(tx, transacaoId, "ENTRADA");
    if (destino.negocioId) {
      await gravarRateio(tx, transacao, [{ negocioId: destino.negocioId }], usuarioId);
      return;
    }
    const categoriasReceita = await tx.centroCusto.findMany({ where: { tipo: "RECEITA", ativo: true }, orderBy: [{ ordem: "asc" }, { nome: "asc" }] });
    const categoria = sugerirCentroCusto(transacao.descricao, "ENTRADA", categoriasReceita) ?? categoriasReceita[0];
    if (!categoria) throw new Error("Cadastre uma categoria de receita em Categorias e centros.");
    await gravarRateio(tx, transacao, [{ centroCustoId: categoria.id, centroGeralId: destino.centroGeralId }], usuarioId);
  });
}

/** Solta a despesa da linha: a criada a partir do extrato some; a registrada antes volta a aguardar. */
async function soltarDespesa(tx: Tx, transacaoId: string) {
  const despesa = await tx.despesa.findUnique({ where: { transacaoId }, select: { id: true, origem: true } });
  if (!despesa) return;
  if (despesa.origem === "EXTRATO") {
    await tx.despesa.delete({ where: { id: despesa.id } });
  } else {
    await tx.despesa.update({ where: { id: despesa.id }, data: { transacaoId: null, status: "AGUARDANDO_CONCILIACAO", conciliadaEm: null } });
  }
}

export async function ignorarTransacao(transacaoId: string, usuarioId: string) {
  await prisma.$transaction(async (tx) => {
    await soltarDespesa(tx, transacaoId);
    await tx.rateioTransacao.deleteMany({ where: { transacaoId } });
    await tx.transacaoBancaria.update({
      where: { id: transacaoId },
      data: { status: "IGNORADA", negocioId: null, conciliadaPorId: usuarioId, conciliadaEm: new Date() },
    });
  });
}

/**
 * "Desfazer": volta a linha pra "não conciliada" — desfaz um par, uma
 * classificação, um rateio ou uma ignorada por engano. A despesa vinculada
 * volta a aguardar conciliação (ou some, se foi criada a partir do extrato).
 */
export async function reabrirTransacao(transacaoId: string) {
  await prisma.$transaction(async (tx) => {
    await soltarDespesa(tx, transacaoId);
    await tx.rateioTransacao.deleteMany({ where: { transacaoId } });
    await tx.transacaoBancaria.update({
      where: { id: transacaoId },
      data: { status: "NAO_CONCILIADA", negocioId: null, conciliadaPorId: null, conciliadaEm: null },
    });
  });
}

export type LinhaRateio = {
  negocioId?: string | null;
  centroCustoId?: string | null;
  /** Só junto de uma categoria (centroCustoId): o centro geral onde ela entra. */
  centroGeralId?: string | null;
  /** Sem valor = o que falta pra completar o lançamento (usado no "100%"). */
  valorCentavos?: number;
  observacao?: string | null;
};

/**
 * Substitui a divisão (rateio) de um lançamento do extrato entre projetos
 * (negócios) e categorias. Cada linha tem exatamente um destino; a soma não
 * pode passar do valor do lançamento. Somando o total, a transação vira
 * CONCILIADA; faltando parte, fica NAO_CONCILIADA com o que já foi
 * classificado (o resto aparece como "a classificar"). negocioId da
 * transação continua apontando pro projeto com a maior parte, pra telas
 * antigas que só mostram um vínculo.
 */
export async function salvarRateio(transacaoId: string, linhas: LinhaRateio[], usuarioId: string) {
  return prisma.$transaction(async (tx) => {
    const transacao = await tx.transacaoBancaria.findUnique({ where: { id: transacaoId }, include: { despesa: { select: { id: true } } } });
    if (!transacao) throw new Error("Lançamento não encontrado.");
    if (transacao.despesa) throw new Error("Esse lançamento está pareado com uma despesa — desfaça o par antes de dividir.");
    return gravarRateio(tx, transacao, linhas, usuarioId);
  });
}

async function gravarRateio(tx: Tx, transacao: { id: string; valorCentavos: number }, linhas: LinhaRateio[], usuarioId: string) {
  let restante = transacao.valorCentavos;
  const normalizadas = linhas.map((l, i) => {
    const temNegocio = Boolean(l.negocioId);
    const temCentro = Boolean(l.centroCustoId);
    if (temNegocio === temCentro) throw new Error(`Linha ${i + 1}: escolha um projeto OU uma categoria.`);
    if (l.centroGeralId && !temCentro) throw new Error(`Linha ${i + 1}: o centro geral vai junto de uma categoria.`);
    const valor = l.valorCentavos ?? restante;
    if (!Number.isInteger(valor) || valor <= 0) throw new Error(`Linha ${i + 1}: informe um valor maior que zero.`);
    restante -= valor;
    return {
      transacaoId: transacao.id,
      valorCentavos: valor,
      negocioId: l.negocioId || null,
      centroCustoId: l.centroCustoId || null,
      centroGeralId: l.centroGeralId || null,
      observacao: l.observacao?.trim() || null,
    };
  });
  if (restante < 0) {
    throw new Error(`A divisão passa do valor do lançamento em ${(-restante / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`);
  }

  const completo = normalizadas.length > 0 && restante === 0;
  const principal = [...normalizadas].filter((l) => l.negocioId).sort((a, b) => b.valorCentavos - a.valorCentavos)[0];

  await tx.rateioTransacao.deleteMany({ where: { transacaoId: transacao.id } });
  if (normalizadas.length) await tx.rateioTransacao.createMany({ data: normalizadas });
  await tx.transacaoBancaria.update({
    where: { id: transacao.id },
    data: completo
      ? { status: "CONCILIADA", negocioId: principal?.negocioId ?? null, conciliadaPorId: usuarioId, conciliadaEm: new Date() }
      : { status: "NAO_CONCILIADA", negocioId: principal?.negocioId ?? null, conciliadaPorId: null, conciliadaEm: null },
  });
  return { completo, restanteCentavos: restante };
}
