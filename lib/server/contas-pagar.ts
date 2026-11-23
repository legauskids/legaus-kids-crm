import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import type { OrigemContaPagar, Prisma } from "@prisma/client";
import { diaBrasilia, inicioDoDiaBrasilia, somarDias } from "@/lib/utils/brasilia";
import { centroDoSeletor, dataDaDespesa, pendenciasDaDespesa, validarCentro } from "@/lib/utils/despesas";
import {
  DIAS_PARA_LIGAR_DESPESA,
  MAX_PARCELAS,
  ROTULO_SITUACAO,
  dataBR,
  grupoDaConta,
  horizonteDasFixas,
  proximosVencimentosFixos,
  rotuloParcela,
  vencimentosDasParcelas,
  type ContaPagarVM,
  type FiltroContas,
  type RascunhoContaVM,
  type RepeticaoConta,
} from "@/lib/utils/contas-pagar";
import { pendenciasDaConta } from "@/lib/utils/conta-agente";

// Contas a pagar (pedido de 2026-11-23) — ver ContaPagar no schema. Paga,
// a conta vira uma Despesa aguardando conciliação, ou é ligada a uma despesa
// que já existia (ex.: a do push do banco); daí em diante é a conciliação de
// sempre (conciliacao-bancaria.ts).

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const SELECT_LISTA = {
  id: true,
  vencimento: true,
  valorCentavos: true,
  fornecedor: true,
  descricao: true,
  categoriaId: true,
  categoria: { select: { nome: true } },
  centroGeralId: true,
  centroGeral: { select: { nome: true } },
  negocioId: true,
  negocio: { select: { titulo: true, contato: { select: { nome: true } } } },
  status: true,
  origem: true,
  codigoPagamento: true,
  parcela: true,
  totalParcelas: true,
  repeteTodoMes: true,
  anexoMime: true,
  pagaEm: true,
  despesaId: true,
  despesa: { select: { status: true } },
  registradaPor: { select: { nome: true } },
} satisfies Prisma.ContaPagarSelect;

type ContaDaLista = Prisma.ContaPagarGetPayload<{ select: typeof SELECT_LISTA }>;

function paraVM(c: ContaDaLista): ContaPagarVM {
  return {
    id: c.id,
    vencimento: diaBrasilia(c.vencimento),
    valorCentavos: c.valorCentavos,
    fornecedor: c.fornecedor,
    descricao: c.descricao,
    categoriaId: c.categoriaId,
    categoriaNome: c.categoria?.nome ?? null,
    centroGeralId: c.centroGeralId,
    centroGeralNome: c.centroGeral?.nome ?? null,
    negocioId: c.negocioId,
    negocioTitulo: c.negocio?.titulo ?? null,
    contatoNome: c.negocio?.contato?.nome ?? null,
    status: c.status,
    origem: c.origem,
    codigoPagamento: c.codigoPagamento,
    parcela: c.parcela,
    totalParcelas: c.totalParcelas,
    repeteTodoMes: c.repeteTodoMes,
    temAnexo: c.anexoMime !== null,
    anexoMime: c.anexoMime,
    pagaEm: c.pagaEm ? diaBrasilia(c.pagaEm) : null,
    despesaId: c.despesaId,
    despesaConciliada: c.despesa?.status === "CONCILIADA",
    registradaPorNome: c.registradaPor.nome,
  };
}

function whereDoFiltro(f: FiltroContas): Prisma.ContaPagarWhereInput {
  const { centroGeralId, negocioId } = f.centro ? centroDoSeletor(f.centro) : { centroGeralId: null, negocioId: null };
  return {
    status: { in: f.situacao === "ABERTAS" ? ["ABERTA"] : f.situacao === "PAGAS" ? ["PAGA"] : ["ABERTA", "PAGA"] },
    ...(f.de || f.ate
      ? {
          vencimento: {
            ...(f.de ? { gte: inicioDoDiaBrasilia(f.de) } : {}),
            ...(f.ate ? { lt: inicioDoDiaBrasilia(somarDias(f.ate, 1)) } : {}),
          },
        }
      : {}),
    ...(f.categoriaId ? { categoriaId: f.categoriaId } : {}),
    ...(centroGeralId ? { centroGeralId } : {}),
    ...(negocioId ? { negocioId } : {}),
    ...(f.fornecedor ? { fornecedor: { contains: f.fornecedor, mode: "insensitive" as const } } : {}),
  };
}

/** Contas do relatório (aba, planilha e PDF). Antes, cria os meses que faltam das contas fixas. */
export async function listarContasPagar(f: FiltroContas): Promise<ContaPagarVM[]> {
  await gerarContasFixas();
  const contas = await prisma.contaPagar.findMany({
    where: whereDoFiltro(f),
    select: SELECT_LISTA,
    orderBy: [{ vencimento: "asc" }, { criadoEm: "asc" }],
    take: 3000,
  });
  return contas.map(paraVM);
}

/** Filtro em palavras, para o PDF: "Em aberto · vencimento de 01/11/2026 a 30/11/2026 · categoria Energia". */
export async function descreverFiltro(f: FiltroContas): Promise<string> {
  const { centroGeralId, negocioId } = f.centro ? centroDoSeletor(f.centro) : { centroGeralId: null, negocioId: null };
  const [categoria, centroGeral, negocio] = await Promise.all([
    f.categoriaId ? prisma.centroCusto.findUnique({ where: { id: f.categoriaId }, select: { nome: true } }) : null,
    centroGeralId ? prisma.centroGeral.findUnique({ where: { id: centroGeralId }, select: { nome: true } }) : null,
    negocioId ? prisma.negocio.findUnique({ where: { id: negocioId }, select: { titulo: true } }) : null,
  ]);
  const partes = [ROTULO_SITUACAO[f.situacao]];
  if (f.de && f.ate) partes.push(`vencimento de ${dataBR(f.de)} a ${dataBR(f.ate)}`);
  else if (f.de) partes.push(`vencimento a partir de ${dataBR(f.de)}`);
  else if (f.ate) partes.push(`vencimento até ${dataBR(f.ate)}`);
  if (categoria) partes.push(`categoria ${categoria.nome}`);
  if (centroGeral) partes.push(`centro ${centroGeral.nome}`);
  if (negocio) partes.push(`projeto ${negocio.titulo}`);
  if (f.fornecedor) partes.push(`fornecedor “${f.fornecedor}”`);
  return partes.join(" · ");
}

type Soma = { quantidade: number; totalCentavos: number };

/** Topo da aba (não depende do filtro). */
export async function resumoContasPagar(hoje: string) {
  const abertas = await prisma.contaPagar.findMany({ where: { status: "ABERTA" }, select: { vencimento: true, valorCentavos: true } });
  const vazio = (): Soma => ({ quantidade: 0, totalCentavos: 0 });
  const resumo = { atrasadas: vazio(), hoje: vazio(), seteDias: vazio(), emAberto: vazio() };
  for (const c of abertas) {
    const grupo = grupoDaConta({ status: "ABERTA", vencimento: diaBrasilia(c.vencimento) }, hoje);
    const alvo = grupo === "ATRASADAS" ? resumo.atrasadas : grupo === "HOJE" ? resumo.hoje : grupo === "SETE_DIAS" ? resumo.seteDias : null;
    for (const s of alvo ? [alvo, resumo.emAberto] : [resumo.emAberto]) {
      s.quantidade += 1;
      s.totalCentavos += c.valorCentavos;
    }
  }
  return resumo;
}

/**
 * Conta fixa: cria os meses seguintes que faltam até o fim do mês que vem,
 * copiando o último mês de cada série (o valor corrigido nele vale para os
 * próximos). O código e o arquivo do boleto não são copiados — mudam todo
 * mês. O @@unique(serieId, vencimento) impede repetir o mesmo mês.
 */
export async function gerarContasFixas(hoje = diaBrasilia(new Date())): Promise<number> {
  const horizonte = horizonteDasFixas(hoje);
  const ultimas = await prisma.contaPagar.findMany({
    // Rascunho do agente nunca é modelo (e nem tem série ainda).
    where: { repeteTodoMes: true, serieId: { not: null }, status: { not: "A_CONFIRMAR" } },
    distinct: ["serieId"],
    orderBy: [{ serieId: "asc" }, { vencimento: "desc" }],
    select: {
      serieId: true,
      vencimento: true,
      diaVencimento: true,
      valorCentavos: true,
      fornecedor: true,
      descricao: true,
      categoriaId: true,
      centroGeralId: true,
      negocioId: true,
      registradaPorId: true,
    },
  });
  const novas = ultimas.flatMap(({ vencimento, diaVencimento, ...copia }) => {
    const ultimo = diaBrasilia(vencimento);
    const dia = diaVencimento ?? Number(ultimo.slice(8));
    return proximosVencimentosFixos(ultimo, dia, horizonte).map((v) => ({
      ...copia,
      vencimento: dataDaDespesa(v),
      diaVencimento: dia,
      repeteTodoMes: true,
      origem: "FIXA" as const,
    }));
  });
  if (novas.length === 0) return 0;
  const { count } = await prisma.contaPagar.createMany({ data: novas, skipDuplicates: true });
  return count;
}

export type DadosContaPagar = {
  vencimento: string;
  valorCentavos: number;
  fornecedor: string;
  descricao?: string | null;
  categoriaId: string | null;
  centroGeralId: string | null;
  negocioId: string | null;
  codigoPagamento?: string | null;
};

export type AnexoConta = { bytes: Buffer; mime: string; nome: string | null };

/** Conta completa: valor, fornecedor, vencimento, categoria e um centro (geral ou projeto). */
function normalizar(d: DadosContaPagar) {
  validarCentro(d);
  const campos = {
    vencimento: dataDaDespesa(d.vencimento),
    valorCentavos: d.valorCentavos,
    fornecedor: d.fornecedor.trim(),
    descricao: d.descricao?.trim() || null,
    categoriaId: d.categoriaId || null,
    centroGeralId: d.centroGeralId || null,
    negocioId: d.negocioId || null,
    codigoPagamento: d.codigoPagamento?.trim() || null,
  };
  const faltando = pendenciasDaDespesa(campos);
  if (faltando.length) throw new Error(`Falta informar: ${faltando.join(", ")}.`);
  return campos;
}

function camposDoAnexo(anexo: AnexoConta | null) {
  return {
    anexoBytes: anexo ? new Uint8Array(anexo.bytes) : null,
    anexoMime: anexo?.mime ?? null,
    anexoNome: anexo?.nome ?? null,
  };
}

/**
 * Nova conta: única, fixa (repete todo mês) ou parcelada (uma conta por
 * parcela, todas na mesma série; o arquivo e o código ficam na 1ª).
 */
export async function criarContaPagar(
  d: DadosContaPagar & {
    repeticao: RepeticaoConta;
    parcelas?: number;
    anexo?: AnexoConta;
    origem?: OrigemContaPagar;
    registradaPorId: string;
  },
): Promise<{ quantidade: number }> {
  const campos = normalizar(d);
  const base = { ...campos, ...camposDoAnexo(d.anexo ?? null), origem: d.origem ?? "MANUAL", registradaPorId: d.registradaPorId };

  if (d.repeticao === "PARCELADA") {
    const n = d.parcelas ?? 0;
    if (!Number.isInteger(n) || n < 2 || n > MAX_PARCELAS) throw new Error(`Número de parcelas: de 2 a ${MAX_PARCELAS}.`);
    const serieId = randomUUID();
    await prisma.contaPagar.createMany({
      data: vencimentosDasParcelas(d.vencimento, n).map((v, i) => ({
        ...base,
        ...(i === 0 ? {} : { ...camposDoAnexo(null), codigoPagamento: null }),
        vencimento: dataDaDespesa(v),
        serieId,
        parcela: i + 1,
        totalParcelas: n,
      })),
    });
    return { quantidade: n };
  }

  if (d.repeticao === "MENSAL") {
    await prisma.contaPagar.create({
      data: { ...base, serieId: randomUUID(), repeteTodoMes: true, diaVencimento: Number(d.vencimento.slice(8)) },
    });
    return { quantidade: 1 + (await gerarContasFixas()) };
  }

  await prisma.contaPagar.create({ data: base });
  return { quantidade: 1 };
}

async function contaExistente(tx: Tx, id: string) {
  const conta = await tx.contaPagar.findUnique({
    where: { id },
    select: { status: true, serieId: true, repeteTodoMes: true, parcela: true, vencimento: true, extracao: true },
  });
  if (!conta || conta.status === "CANCELADA") throw new Error("Conta não encontrada.");
  return conta;
}

/**
 * Edita uma conta ainda não paga. `anexo`: undefined mantém, null tira.
 * `repeteTodoMes` (só fora de parcelamento): ligar torna a conta fixa;
 * desligar para a série inteira e tira os meses seguintes que nasceram
 * sozinhos e ainda estão em aberto.
 */
export async function atualizarContaPagar(
  id: string,
  d: DadosContaPagar & { repeteTodoMes?: boolean; anexo?: AnexoConta | null },
): Promise<void> {
  const campos = normalizar(d);
  const ligouRepeticao = await prisma.$transaction(async (tx) => {
    const atual = await contaExistente(tx, id);
    if (atual.status === "PAGA") throw new Error("Essa conta já está paga — desfaça o pagamento antes de alterar.");

    // Rascunho do agente editado na tela: só os dados e a intenção de repetir
    // (a série nasce quando for lançado); o vencimento passa a valer como dito.
    if (atual.status === "A_CONFIRMAR") {
      const log = (atual.extracao ?? {}) as Prisma.JsonObject;
      await tx.contaPagar.update({
        where: { id },
        data: {
          ...campos,
          ...(d.anexo === undefined ? {} : camposDoAnexo(d.anexo)),
          ...(d.repeteTodoMes !== undefined ? { repeteTodoMes: d.repeteTodoMes } : {}),
          extracao: { ...log, vencimentoInformado: true, categoriaDeclarada: true, centroDeclarado: true } as Prisma.InputJsonValue,
        },
      });
      return false;
    }

    let serie: { serieId?: string; repeteTodoMes?: boolean } = {};
    if (d.repeteTodoMes !== undefined && atual.parcela === null && d.repeteTodoMes !== atual.repeteTodoMes) {
      if (d.repeteTodoMes) {
        const serieId = atual.serieId ?? randomUUID();
        if (atual.serieId) await tx.contaPagar.updateMany({ where: { serieId }, data: { repeteTodoMes: true } });
        serie = { serieId, repeteTodoMes: true };
      } else if (atual.serieId) {
        await tx.contaPagar.updateMany({ where: { serieId: atual.serieId }, data: { repeteTodoMes: false } });
        await tx.contaPagar.deleteMany({
          where: { serieId: atual.serieId, vencimento: { gt: atual.vencimento }, status: "ABERTA", origem: "FIXA" },
        });
        serie = { repeteTodoMes: false };
      }
    }
    const fixa = serie.repeteTodoMes ?? atual.repeteTodoMes;
    await tx.contaPagar.update({
      where: { id },
      data: {
        ...campos,
        ...(d.anexo === undefined ? {} : camposDoAnexo(d.anexo)),
        ...serie,
        // O próximo mês copia o dia do último: mudar o vencimento muda os seguintes.
        ...(fixa ? { diaVencimento: Number(d.vencimento.slice(8)) } : {}),
      },
    });
    return serie.repeteTodoMes === true;
  });
  if (ligouRepeticao) await gerarContasFixas();
}

/** Mês de conta fixa vira CANCELADA (senão a repetição criaria o mesmo mês de novo); o resto é apagado. */
export async function excluirContaPagar(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const conta = await contaExistente(tx, id);
    if (conta.status === "PAGA") throw new Error("Essa conta já está paga — desfaça o pagamento antes de excluir.");
    if (conta.serieId && conta.repeteTodoMes) {
      await tx.contaPagar.update({ where: { id }, data: { status: "CANCELADA", ...camposDoAnexo(null) } });
    } else {
      await tx.contaPagar.delete({ where: { id } });
    }
  });
}

/**
 * Despesas já registradas que podem ser o pagamento desta conta: mesmo valor,
 * até 5 dias antes ou depois do pagamento ou do vencimento, confirmadas e
 * sem outra conta. É o caso do push do banco, que vira despesa sozinho.
 */
export async function despesasParaLigar(contaId: string, dia: string, valorCentavos: number) {
  const conta = await prisma.contaPagar.findUnique({ where: { id: contaId }, select: { vencimento: true } });
  if (!conta || !Number.isInteger(valorCentavos) || valorCentavos <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return [];
  const dias = [dia, diaBrasilia(conta.vencimento)].sort();
  const despesas = await prisma.despesa.findMany({
    where: {
      valorCentavos,
      status: { in: ["AGUARDANDO_CONCILIACAO", "CONCILIADA"] },
      contaPagar: { is: null },
      data: {
        gte: inicioDoDiaBrasilia(somarDias(dias[0], -DIAS_PARA_LIGAR_DESPESA)),
        lt: inicioDoDiaBrasilia(somarDias(dias[1], DIAS_PARA_LIGAR_DESPESA + 1)),
      },
    },
    select: { id: true, data: true, fornecedor: true, origem: true, status: true, valorCentavos: true, categoria: { select: { nome: true } } },
    orderBy: { data: "desc" },
    take: 10,
  });
  return despesas.map((d) => ({
    id: d.id,
    dia: diaBrasilia(d.data),
    fornecedor: d.fornecedor,
    origem: d.origem,
    status: d.status,
    valorCentavos: d.valorCentavos,
    categoriaNome: d.categoria?.nome ?? null,
  }));
}

function descricaoDaDespesa(c: { descricao: string | null; parcela: number | null; totalParcelas: number | null }): string {
  const parcela = rotuloParcela(c.parcela, c.totalParcelas);
  return `Conta a pagar${parcela ? ` (parcela ${parcela})` : ""}${c.descricao ? ` — ${c.descricao}` : ""}`;
}

/**
 * "Marcar como paga": liga a uma despesa já registrada (`despesaId`) ou cria
 * a despesa do pagamento, aguardando conciliação, com a categoria e o centro
 * da conta.
 */
export async function marcarContaPaga(
  id: string,
  pagamento: { dia: string; valorCentavos: number; despesaId?: string | null },
  usuarioId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const conta = await tx.contaPagar.findUnique({
      where: { id },
      select: {
        status: true,
        valorCentavos: true,
        fornecedor: true,
        descricao: true,
        categoriaId: true,
        centroGeralId: true,
        negocioId: true,
        parcela: true,
        totalParcelas: true,
      },
    });
    if (!conta || conta.status === "CANCELADA") throw new Error("Conta não encontrada.");
    if (conta.status === "PAGA") throw new Error("Essa conta já está paga.");
    if (conta.status === "A_CONFIRMAR") throw new Error("Confirme a conta antes de marcar como paga.");

    if (pagamento.despesaId) {
      const despesa = await tx.despesa.findUnique({
        where: { id: pagamento.despesaId },
        select: { data: true, status: true, contaPagar: { select: { id: true } } },
      });
      if (!despesa) throw new Error("Despesa não encontrada.");
      if (despesa.contaPagar) throw new Error("Essa despesa já é o pagamento de outra conta.");
      if (despesa.status === "A_CONFIRMAR") throw new Error("Essa despesa ainda é rascunho — confirme antes de ligar.");
      await tx.contaPagar.update({
        where: { id },
        data: { status: "PAGA", pagaEm: despesa.data, despesaId: pagamento.despesaId, despesaCriada: false },
      });
      return;
    }

    const pagaEm = dataDaDespesa(pagamento.dia);
    if (pagamento.dia > diaBrasilia(new Date())) throw new Error("A data do pagamento não pode ser depois de hoje.");
    if (!Number.isInteger(pagamento.valorCentavos) || pagamento.valorCentavos <= 0) throw new Error("Valor pago inválido.");
    const faltando = pendenciasDaDespesa(conta);
    if (faltando.length) throw new Error(`Falta informar na conta: ${faltando.join(", ")}. Edite a conta antes.`);
    const despesa = await tx.despesa.create({
      data: {
        data: pagaEm,
        valorCentavos: pagamento.valorCentavos,
        fornecedor: conta.fornecedor,
        descricao: descricaoDaDespesa(conta),
        categoriaId: conta.categoriaId,
        centroGeralId: conta.centroGeralId,
        negocioId: conta.negocioId,
        status: "AGUARDANDO_CONCILIACAO",
        origem: "MANUAL",
        confirmadaEm: new Date(),
        registradaPorId: usuarioId,
      },
    });
    await tx.contaPagar.update({ where: { id }, data: { status: "PAGA", pagaEm, despesaId: despesa.id, despesaCriada: true } });
  });
}

/** Volta a conta para em aberto: apaga a despesa criada pelo pagamento (se ainda não conciliada) ou só desliga a que já existia. */
export async function desfazerPagamento(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const conta = await tx.contaPagar.findUnique({
      where: { id },
      select: { status: true, despesaId: true, despesaCriada: true, despesa: { select: { status: true } } },
    });
    if (!conta || conta.status !== "PAGA") throw new Error("Essa conta não está paga.");
    if (conta.despesaId && conta.despesaCriada && conta.despesa?.status === "CONCILIADA") {
      throw new Error("A despesa desse pagamento já foi conciliada com o extrato — desfaça a conciliação antes.");
    }
    await tx.contaPagar.update({ where: { id }, data: { status: "ABERTA", pagaEm: null, despesaId: null, despesaCriada: false } });
    if (conta.despesaId && conta.despesaCriada) await tx.despesa.delete({ where: { id: conta.despesaId } });
  });
}

export function getAnexoContaPagar(id: string) {
  return prisma.contaPagar.findUnique({ where: { id }, select: { anexoBytes: true, anexoMime: true, anexoNome: true } });
}

/** Rascunhos do agente (WhatsApp/Telegram) que ninguém confirmou: a aba mostra para lançar, editar ou descartar. */
export async function listarRascunhosConta(): Promise<RascunhoContaVM[]> {
  const contas = await prisma.contaPagar.findMany({
    where: { status: "A_CONFIRMAR" },
    select: { ...SELECT_LISTA, extracao: true },
    orderBy: { criadoEm: "desc" },
    take: 50,
  });
  return contas.map(({ extracao, ...c }) => {
    const vencimentoInformado = ((extracao ?? {}) as Prisma.JsonObject).vencimentoInformado !== false;
    return { ...paraVM(c), vencimentoInformado, faltando: pendenciasDaConta({ ...c, vencimentoInformado }) };
  });
}
