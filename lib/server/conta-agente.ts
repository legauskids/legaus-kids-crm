import "server-only";
import { randomUUID } from "node:crypto";
import type { OrigemContaPagar, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { gerarContasFixas, type AnexoConta } from "@/lib/server/contas-pagar";
import { carregarCadastrosDespesa, pedirConfirmacao, perguntarOQueCorrigir, type RespostaDespesa } from "@/lib/server/despesa-agente";
import { vincularPagamento } from "@/lib/server/conta-pagamento";
import { diaBrasilia, somarDias } from "@/lib/utils/brasilia";
import { dataDaDespesa } from "@/lib/utils/despesas";
import { dataBR, vencimentosDasParcelas } from "@/lib/utils/contas-pagar";
import { canalDoIdentificador, type PedidoBotao } from "@/lib/utils/agente-canal";
import { OPCAO_CONFIRMAR, OPCAO_DESCARTAR, OPCAO_NEGOCIO, negociosParecidos, resolverCategoria, resolverCentro } from "@/lib/utils/despesa-agente";
import {
  OPCAO_E_A_CONTA,
  botoesDaConta,
  botoesDeCategoriasConta,
  botoesDeCentrosConta,
  enqueteDaConta,
  mensagemContaLancada,
  mensagemDaConta,
  montarContaDaMensagem,
  parcelasValidas,
  pendenciasDaConta,
  resolverVencimentoFalado,
  type ExtracaoConta,
} from "@/lib/utils/conta-agente";

// Contas a pagar pelo agente (WhatsApp, Telegram e chat do CRM — pedido de
// 2026-11-23, etapa 2): a parte que mexe no banco. A conta nasce rascunho
// (A_CONFIRMAR, com a conversa em telefoneOrigem) e só vira conta aberta
// confirmada; aí a parcelada ganha as outras parcelas e a fixa, o mês
// seguinte (contas-pagar.ts). As regras ficam em lib/utils/conta-agente.ts.

/** Rascunho esperando confirmação vale por 30 minutos, como o da despesa. */
const JANELA_RASCUNHO_MS = 30 * 60 * 1000;

const SEM_BYTES = {
  id: true,
  status: true,
  vencimento: true,
  valorCentavos: true,
  fornecedor: true,
  descricao: true,
  categoriaId: true,
  centroGeralId: true,
  negocioId: true,
  codigoPagamento: true,
  totalParcelas: true,
  repeteTodoMes: true,
  anexoMime: true,
  textoOriginal: true,
  extracao: true,
  telefoneOrigem: true,
  atualizadoEm: true,
} satisfies Prisma.ContaPagarSelect;

/** Rascunho de conta mais recente desta conversa ainda esperando confirmação. */
export function buscarRascunhoContaAtivo(identificador: string) {
  return prisma.contaPagar.findFirst({
    where: { telefoneOrigem: identificador, status: "A_CONFIRMAR", atualizadoEm: { gte: new Date(Date.now() - JANELA_RASCUNHO_MS) } },
    orderBy: { atualizadoEm: "desc" },
    select: SEM_BYTES,
  });
}

/** O que a pessoa disse e o que foi deduzido, pelo log da conta. */
function doLog(extracao: Prisma.JsonValue | null) {
  const log = (extracao ?? {}) as Prisma.JsonObject;
  return {
    log,
    vencimentoInformado: log.vencimentoInformado !== false,
    categoriaDeclarada: Boolean(log.categoriaDeclarada),
    centroDeclarado: Boolean(log.centroDeclarado),
  };
}

async function resumo(id: string) {
  const c = await prisma.contaPagar.findUniqueOrThrow({
    where: { id },
    select: { ...SEM_BYTES, categoria: { select: { nome: true } }, centroGeral: { select: { nome: true } }, negocio: { select: { titulo: true } } },
  });
  const { vencimentoInformado, categoriaDeclarada, centroDeclarado } = doLog(c.extracao);
  return {
    conta: c,
    dados: {
      vencimento: vencimentoInformado ? diaBrasilia(c.vencimento) : null,
      valorCentavos: c.valorCentavos,
      fornecedor: c.fornecedor,
      codigoPagamento: c.codigoPagamento,
      totalParcelas: c.totalParcelas,
      repeteTodoMes: c.repeteTodoMes,
    },
    nomes: { categoria: c.categoria?.nome ?? null, centro: c.negocio?.titulo ?? c.centroGeral?.nome ?? null, centroEhProjeto: Boolean(c.negocioId) },
    faltando: pendenciasDaConta({ ...c, vencimentoInformado }),
    categoriaDeduzida: !categoriaDeclarada,
    centroDeduzido: !centroDeclarado,
    temArquivo: c.anexoMime !== null,
  };
}

/** Resumo do rascunho + a enquete (WhatsApp) ou os botões (Telegram). */
export async function pedirConfirmacaoConta(id: string, identificador: string, intro?: string): Promise<RespostaDespesa> {
  const r = await resumo(id);
  const canal = canalDoIdentificador(identificador);
  return {
    mensagem: mensagemDaConta(r, diaBrasilia(new Date()), intro, canal),
    enquete: canal === "whatsapp" ? enqueteDaConta({ ...r.conta, ehProjeto: r.nomes.centroEhProjeto }) : undefined,
    botoes:
      canal === "telegram"
        ? botoesDaConta({
            id,
            ehProjeto: r.nomes.centroEhProjeto,
            categoria: r.nomes.categoria,
            categoriaDeduzida: r.categoriaDeduzida,
            centro: r.nomes.centro,
            centroDeduzido: r.centroDeduzido,
          })
        : undefined,
  };
}

/** Texto curto do rascunho para o contexto do modelo (para entender a correção). */
export async function descreverRascunhoConta(id: string): Promise<string> {
  const r = await resumo(id);
  return mensagemDaConta(r, diaBrasilia(new Date()), "Conta a pagar esperando confirmação de quem está falando:", "crm").split("\n\n")[0];
}

/**
 * Lança como rascunho a conta da mensagem (boleto/fatura em foto ou PDF,
 * texto ou áudio) e pede confirmação. Mesma conta de novo, ou mensagem sem
 * valor, com um rascunho esperando = complemento dele.
 */
export async function registrarContaDaMensagem(input: {
  extracao: ExtracaoConta;
  texto: string;
  origem: OrigemContaPagar;
  identificador: string;
  usuarioId: string;
  anexo?: AnexoConta;
}): Promise<RespostaDespesa & { contaId: string | null }> {
  const hoje = diaBrasilia(new Date());
  const cadastros = await carregarCadastrosDespesa();
  const montada = montarContaDaMensagem({ texto: input.texto, hoje, extracao: input.extracao, ...cadastros });
  const d = montada.dados;
  const rascunho = await buscarRascunhoContaAtivo(input.identificador);
  // Nada para lançar (sem valor, vencimento nem arquivo, e nenhum rascunho
  // esperando): não cria conta vazia, pede os dados.
  if (!rascunho && d.valorCentavos === 0 && !d.vencimento && !input.anexo) {
    return { mensagem: "Não entendi a conta a pagar — me diga o valor, de quem é e o vencimento (ou mande a foto/PDF do boleto).", contaId: null };
  }
  const log = {
    mensagem: input.texto,
    origem: input.origem,
    extraidoPeloModelo: input.extracao,
    resolvido: { ...d, categoria: montada.nomes.categoria, centro: montada.nomes.centro },
    vencimentoInformado: d.vencimento !== null,
    categoriaDeclarada: montada.categoriaDeclarada,
    centroDeclarado: montada.centroDeclarado,
  };
  console.log(`[conta-agente] ${input.identificador}: ${JSON.stringify(log)}`);

  if (rascunho && (d.valorCentavos === 0 || rascunho.valorCentavos === 0 || d.valorCentavos === rascunho.valorCentavos)) {
    const r = await complementarRascunho(rascunho, input, montada);
    return { ...r, contaId: rascunho.id };
  }

  // A mesma conta já lançada (o boleto mandado de novo): avisa no resumo.
  const parecida =
    d.valorCentavos > 0 && d.vencimento
      ? await prisma.contaPagar.findFirst({
          where: {
            status: { in: ["ABERTA", "PAGA"] },
            valorCentavos: d.valorCentavos,
            vencimento: { gte: dataDaDespesa(somarDias(d.vencimento, -3)), lte: dataDaDespesa(somarDias(d.vencimento, 3)) },
          },
          select: { id: true, fornecedor: true, vencimento: true, status: true },
        })
      : null;

  const conta = await prisma.contaPagar.create({
    data: {
      status: "A_CONFIRMAR",
      origem: input.origem,
      // Sem vencimento ainda: guarda hoje e pede o certo (log.vencimentoInformado).
      vencimento: dataDaDespesa(d.vencimento ?? hoje),
      valorCentavos: d.valorCentavos,
      fornecedor: d.fornecedor,
      descricao: d.descricao,
      categoriaId: d.categoriaId,
      centroGeralId: d.centroGeralId,
      negocioId: d.negocioId,
      codigoPagamento: d.codigoPagamento,
      totalParcelas: d.totalParcelas,
      repeteTodoMes: d.repeteTodoMes,
      anexoBytes: input.anexo ? new Uint8Array(input.anexo.bytes) : null,
      anexoMime: input.anexo?.mime ?? null,
      anexoNome: input.anexo?.nome ?? null,
      textoOriginal: input.texto.trim() || null,
      extracao: { ...log, parecidaCom: parecida?.id ?? null } as Prisma.InputJsonValue,
      telefoneOrigem: input.identificador,
      registradaPorId: input.usuarioId,
    },
    select: { id: true },
  });
  const aviso = parecida
    ? `⚠️ Parece a conta já lançada: *${parecida.fornecedor}*, vencimento ${dataBR(diaBrasilia(parecida.vencimento))}${parecida.status === "PAGA" ? " (já paga)" : ""}. Se for a mesma, ${canalDoIdentificador(input.identificador) === "whatsapp" ? "toque em *Descartar*" : "descarte esta"}.\n\n`
    : "";
  const r = await pedirConfirmacaoConta(conta.id, input.identificador, `${aviso}Entendi esta conta a pagar, confere?`);
  return { ...r, contaId: conta.id };
}

/** Complemento do rascunho: entra o que foi dito agora ou o que ele ainda não tinha. Nada novo = resposta curta. */
async function complementarRascunho(
  rascunho: NonNullable<Awaited<ReturnType<typeof buscarRascunhoContaAtivo>>>,
  input: { texto: string; anexo?: AnexoConta; extracao: ExtracaoConta },
  montada: ReturnType<typeof montarContaDaMensagem>,
): Promise<RespostaDespesa> {
  const d = montada.dados;
  const { log, vencimentoInformado } = doLog(rascunho.extracao);
  const mudancas: Prisma.ContaPagarUncheckedUpdateInput = {};
  if (!rascunho.valorCentavos && d.valorCentavos) mudancas.valorCentavos = d.valorCentavos;
  if (!rascunho.fornecedor.trim() && d.fornecedor) mudancas.fornecedor = d.fornecedor;
  if (d.vencimento && (!vencimentoInformado || d.vencimento !== diaBrasilia(rascunho.vencimento))) mudancas.vencimento = dataDaDespesa(d.vencimento);
  if (d.categoriaId && d.categoriaId !== rascunho.categoriaId && (montada.categoriaDeclarada || !rascunho.categoriaId)) mudancas.categoriaId = d.categoriaId;
  const centroNovo = d.negocioId ?? d.centroGeralId;
  if (centroNovo && centroNovo !== (rascunho.negocioId ?? rascunho.centroGeralId) && (montada.centroDeclarado || montada.nomes.centroEhProjeto || !(rascunho.negocioId ?? rascunho.centroGeralId))) {
    mudancas.centroGeralId = d.centroGeralId;
    mudancas.negocioId = d.negocioId;
  }
  if (d.codigoPagamento && !rascunho.codigoPagamento) mudancas.codigoPagamento = d.codigoPagamento;
  if (d.totalParcelas && d.totalParcelas !== rascunho.totalParcelas) Object.assign(mudancas, { totalParcelas: d.totalParcelas, repeteTodoMes: false });
  if (d.repeteTodoMes && !rascunho.repeteTodoMes) Object.assign(mudancas, { repeteTodoMes: true, totalParcelas: null });
  if (input.anexo && !rascunho.anexoMime) {
    mudancas.anexoBytes = new Uint8Array(input.anexo.bytes);
    mudancas.anexoMime = input.anexo.mime;
    mudancas.anexoNome = input.anexo.nome;
  }
  const mudou = Object.keys(mudancas).length > 0;
  const complementos = Array.isArray(log.complementos) ? log.complementos : [];
  await prisma.contaPagar.update({
    where: { id: rascunho.id },
    data: {
      ...mudancas,
      textoOriginal: input.texto.trim() ? [rascunho.textoOriginal, input.texto.trim()].filter(Boolean).join("\n\n") : undefined,
      extracao: {
        ...log,
        vencimentoInformado: vencimentoInformado || mudancas.vencimento !== undefined,
        centroDeclarado: Boolean(log.centroDeclarado) || (mudancas.negocioId !== undefined && (montada.centroDeclarado || montada.nomes.centroEhProjeto)),
        complementos: [...complementos, { mensagem: input.texto, extraidoPeloModelo: input.extracao, mudou, em: new Date().toISOString() }],
      } as Prisma.InputJsonValue,
    },
  });
  if (!mudou) return jaEstaAssim(rascunho.telefoneOrigem ?? "");
  return pedirConfirmacaoConta(rascunho.id, rascunho.telefoneOrigem ?? "", "Atualizei a conta que estava esperando, confere?");
}

function jaEstaAssim(identificador: string): RespostaDespesa {
  const canal = canalDoIdentificador(identificador);
  return {
    mensagem:
      canal === "whatsapp"
        ? "Já está assim 👍 Confirme na enquete acima ou responda *sim*."
        : canal === "telegram"
          ? "Já está assim 👍 Toque em *Confirmar* acima ou responda *sim*."
          : "Já está assim 👍 Responda *sim* para lançar.",
  };
}

/**
 * Confirmação (enquete, botão, "sim"): a conta vira aberta. Parcelada ganha
 * as outras parcelas (o arquivo e o código ficam na 1ª); fixa começa a série
 * e o mês seguinte nasce (gerarContasFixas).
 */
export async function confirmarRascunhoConta(id: string, identificador: string): Promise<RespostaDespesa> {
  const r = await resumo(id);
  if (r.conta.status !== "A_CONFIRMAR") return { mensagem: "Essa conta já tinha sido lançada 👍" };
  if (r.faltando.length) {
    if (canalDoIdentificador(identificador) === "telegram" && !r.faltando.includes("vencimento")) {
      const { categorias, centrosGerais } = await carregarCadastrosDespesa();
      if (r.faltando.includes("categoria")) return { mensagem: "Antes de lançar, escolha a categoria:", botoes: botoesDeCategoriasConta(id, categorias, null) };
      if (r.faltando.includes("centro de custo")) return { mensagem: "Antes de lançar, escolha o centro de custo:", botoes: botoesDeCentrosConta(id, centrosGerais, null) };
    }
    return { mensagem: `Ainda falta: ${r.faltando.join(", ")}. Me diga para eu completar (ex.: "vence dia 10", "o centro é Administrativo").` };
  }

  const c = r.conta;
  const vencimento = diaBrasilia(c.vencimento);
  await prisma.$transaction(async (tx) => {
    if (c.totalParcelas && c.totalParcelas >= 2) {
      const serieId = randomUUID();
      const atual = await tx.contaPagar.findUniqueOrThrow({ where: { id }, select: { origem: true, registradaPorId: true } });
      await tx.contaPagar.update({ where: { id }, data: { status: "ABERTA", serieId, parcela: 1 } });
      await tx.contaPagar.createMany({
        data: vencimentosDasParcelas(vencimento, c.totalParcelas)
          .slice(1)
          .map((v, i) => ({
            vencimento: dataDaDespesa(v),
            valorCentavos: c.valorCentavos,
            fornecedor: c.fornecedor,
            descricao: c.descricao,
            categoriaId: c.categoriaId,
            centroGeralId: c.centroGeralId,
            negocioId: c.negocioId,
            origem: atual.origem,
            registradaPorId: atual.registradaPorId,
            serieId,
            parcela: i + 2,
            totalParcelas: c.totalParcelas,
          })),
      });
    } else if (c.repeteTodoMes) {
      await tx.contaPagar.update({ where: { id }, data: { status: "ABERTA", serieId: randomUUID(), diaVencimento: Number(vencimento.slice(8)) } });
    } else {
      await tx.contaPagar.update({ where: { id }, data: { status: "ABERTA" } });
    }
  });
  if (c.repeteTodoMes) await gerarContasFixas();
  console.log(`[conta-agente] conta ${id} lançada`);

  const lancada = mensagemContaLancada(r.dados, diaBrasilia(new Date()));
  const proxima = await buscarRascunhoContaAtivo(identificador);
  if (!proxima) return { mensagem: lancada };
  const pedido = await pedirConfirmacaoConta(proxima.id, identificador, "Tem mais uma esperando:");
  return { mensagem: `${lancada}\n\n${pedido.mensagem}`, enquete: pedido.enquete, botoes: pedido.botoes };
}

export async function descartarRascunhoConta(id: string): Promise<RespostaDespesa> {
  await prisma.contaPagar.delete({ where: { id } });
  return { mensagem: "Descartei essa conta, não lancei nada." };
}

/**
 * Correção em linguagem natural do rascunho ("não, vence dia 15", "são 3
 * parcelas", "é conta fixa", "o centro é produção"). Conta já lançada se
 * corrige na tela.
 */
export async function corrigirContaDaConversa(input: { identificador: string; correcao: ExtracaoConta; texto: string }): Promise<RespostaDespesa> {
  const alvo = await buscarRascunhoContaAtivo(input.identificador);
  if (!alvo) {
    return { mensagem: "Não achei nenhuma conta esperando confirmação para corrigir. Conta já lançada se corrige em Financeiro → Contas a pagar." };
  }
  const hoje = diaBrasilia(new Date());
  const { categorias, centrosGerais, negocios } = await carregarCadastrosDespesa();
  const c = input.correcao;
  const { log, vencimentoInformado } = doLog(alvo.extracao);
  let centroDeclarado = Boolean(log.centroDeclarado);
  let categoriaDeclarada = Boolean(log.categoriaDeclarada);
  let informado = vencimentoInformado;
  const mudancas: Prisma.ContaPagarUncheckedUpdateInput = {};
  const naoEntendi: string[] = [];
  let duvidaNegocio = "";

  if (c.valor && c.valor > 0) mudancas.valorCentavos = Math.round(c.valor * 100);
  if (c.fornecedor?.trim()) mudancas.fornecedor = c.fornecedor.trim();
  if (c.descricao?.trim()) mudancas.descricao = c.descricao.trim();
  if (c.codigoPagamento?.trim()) mudancas.codigoPagamento = c.codigoPagamento.trim();
  if (c.vencimentoTexto?.trim()) {
    const dia = resolverVencimentoFalado(c.vencimentoTexto, hoje);
    if (dia) {
      mudancas.vencimento = dataDaDespesa(dia);
      informado = true;
    } else naoEntendi.push("o vencimento");
  }
  if (c.parcelas !== undefined && c.parcelas !== null) {
    const n = parcelasValidas(c.parcelas);
    mudancas.totalParcelas = n;
    if (n) mudancas.repeteTodoMes = false;
  }
  if (c.repeteTodoMes === true) Object.assign(mudancas, { repeteTodoMes: true, totalParcelas: null });
  if (c.repeteTodoMes === false) mudancas.repeteTodoMes = false;
  if (c.centro?.trim()) {
    const centro = resolverCentro(c.centro, centrosGerais, negocios);
    if (centro) {
      mudancas.centroGeralId = centro.tipo === "GERAL" ? centro.id : null;
      mudancas.negocioId = centro.tipo === "NEGOCIO" ? centro.id : null;
      centroDeclarado = true;
    } else {
      const parecidos = negociosParecidos(c.centro, negocios);
      if (parecidos.length) {
        duvidaNegocio = `Achei mais de um negócio para "${c.centro}": ${parecidos.map((n) => `*${n.titulo}*`).join(", ")} — diga qual.`;
      } else naoEntendi.push(`o negócio "${c.centro}"`);
    }
  }
  if (c.categoria?.trim()) {
    const categoria = resolverCategoria(c.categoria, categorias);
    if (categoria) {
      mudancas.categoriaId = categoria.id;
      categoriaDeclarada = true;
      // Centro deduzido (e geral) acompanha a categoria nova, como na despesa.
      if (!c.centro?.trim() && !centroDeclarado && !alvo.negocioId && categoria.centroGeralPadraoId) mudancas.centroGeralId = categoria.centroGeralPadraoId;
    } else naoEntendi.push(`a categoria "${c.categoria}"`);
  }

  // Só conta o que muda de verdade.
  const atual: Record<string, unknown> = alvo;
  for (const [campo, valor] of Object.entries(mudancas)) {
    const antes = atual[campo];
    const igual = valor instanceof Date && antes instanceof Date ? valor.getTime() === antes.getTime() && vencimentoInformado : valor === antes;
    if (igual) delete (mudancas as Record<string, unknown>)[campo];
  }
  const mudou = Object.keys(mudancas).length > 0;
  const correcoes = Array.isArray(log.correcoes) ? log.correcoes : [];
  await prisma.contaPagar.update({
    where: { id: alvo.id },
    data: {
      ...mudancas,
      extracao: {
        ...log,
        vencimentoInformado: informado,
        centroDeclarado,
        categoriaDeclarada,
        correcoes: [...correcoes, { mensagem: input.texto, extraidoPeloModelo: c, mudou, em: new Date().toISOString() }],
      } as Prisma.InputJsonValue,
    },
  });
  console.log(`[conta-agente] correção ${alvo.id}: ${JSON.stringify({ mensagem: input.texto, correcao: c, mudou: Object.keys(mudancas), naoEntendi })}`);

  const naoAchei = [naoEntendi.length ? `Não entendi ${naoEntendi.join(" nem ")}. Diga de outro jeito.` : "", duvidaNegocio].filter(Boolean).join(" ");
  if (!mudou) return naoAchei ? { mensagem: naoAchei } : jaEstaAssim(input.identificador);
  const pedido = await pedirConfirmacaoConta(alvo.id, input.identificador, "Corrigi, confere?");
  return { ...pedido, mensagem: (naoAchei ? `${naoAchei}\n\n` : "") + pedido.mensagem };
}

/** Rascunho da conta desta conversa ou null (de outra conversa / não existe mais → mensagem). */
async function rascunhoDaConversa(id: string, identificador: string) {
  const conta = await prisma.contaPagar.findUnique({ where: { id }, select: { id: true, status: true, telefoneOrigem: true, negocioId: true, centroGeralId: true, categoriaId: true } });
  if (!conta) return { resposta: { mensagem: "Essa conta não existe mais (já tinha sido descartada)." } };
  if (conta.telefoneOrigem !== identificador) return null;
  if (conta.status !== "A_CONFIRMAR") return { resposta: { mensagem: "Essa conta já foi lançada — se precisar mudar algo, ajuste em Financeiro → Contas a pagar." } };
  return { conta };
}

function renovar(id: string) {
  return prisma.contaPagar.update({ where: { id }, data: { atualizadoEm: new Date() } });
}

/**
 * Voto em enquete do WhatsApp: "conta:<id>" (Confirmar / É de um negócio /
 * Descartar) ou "pagamento:<contaId>:<despesaId>" (É essa conta / Não).
 * null = não é de conta ou não é desta conversa.
 */
export async function responderEnqueteConta(input: { identificador: string; ref: string; opcao: string }): Promise<RespostaDespesa | null> {
  if (input.ref.startsWith("pagamento:")) {
    const [, contaId, despesaId] = input.ref.split(":");
    if (!contaId || !despesaId) return null;
    if (input.opcao === OPCAO_E_A_CONTA) return vincularPagamento(contaId, despesaId, input.identificador);
    const despesa = await prisma.despesa.findUnique({ where: { id: despesaId }, select: { telefoneOrigem: true } });
    return despesa?.telefoneOrigem === input.identificador ? { mensagem: "Ok, não liguei a nenhuma conta." } : null;
  }
  if (!input.ref.startsWith("conta:")) return null;
  const achado = await rascunhoDaConversa(input.ref.slice("conta:".length), input.identificador);
  if (!achado) return null;
  if (!achado.conta) return achado.resposta ?? null;
  const { conta } = achado;
  if (input.opcao === OPCAO_CONFIRMAR) return confirmarRascunhoConta(conta.id, input.identificador);
  if (input.opcao === OPCAO_DESCARTAR) return descartarRascunhoConta(conta.id);
  if (input.opcao === OPCAO_NEGOCIO) {
    await renovar(conta.id);
    return { mensagem: "Qual negócio? Me diga o nome do cliente ou da obra (texto ou áudio) que eu vinculo." };
  }
  return null;
}

/** Um toque em botão de conta ou de pagamento (Telegram). null = não é desta conversa. */
export async function responderBotaoConta(pedido: PedidoBotao, identificador: string): Promise<RespostaDespesa | null> {
  if (pedido.tipo === "pagamento") return vincularPagamento(pedido.contaId, pedido.despesaId, identificador);
  if (pedido.tipo === "pagamento-nao") {
    const despesa = await prisma.despesa.findUnique({ where: { id: pedido.despesaId }, select: { status: true, telefoneOrigem: true } });
    if (!despesa) return { mensagem: "Essa despesa não existe mais." };
    if (despesa.telefoneOrigem !== identificador) return null;
    // Push do banco ainda em rascunho: segue a confirmação normal da despesa.
    if (despesa.status === "A_CONFIRMAR") return pedirConfirmacao(pedido.despesaId, identificador, "Certo, não é de conta a pagar. O que foi? Confira:");
    return { mensagem: "Ok, não liguei a nenhuma conta." };
  }
  if (pedido.tipo !== "conta" && pedido.tipo !== "conta-categoria" && pedido.tipo !== "conta-centro") return null;

  const achado = await rascunhoDaConversa(pedido.contaId, identificador);
  if (!achado) return null;
  if (!achado.conta) return achado.resposta ?? null;
  const { conta } = achado;
  const { log } = doLog((await prisma.contaPagar.findUniqueOrThrow({ where: { id: conta.id }, select: { extracao: true } })).extracao);

  if (pedido.tipo === "conta-categoria") {
    const { categorias } = await carregarCadastrosDespesa();
    const achadas = categorias.filter((c) => c.id.startsWith(pedido.prefixo));
    if (achadas.length !== 1) return { mensagem: "Não achei essa categoria — toque em trocar de novo." };
    const categoria = achadas[0];
    const centro = !log.centroDeclarado && !conta.negocioId && categoria.centroGeralPadraoId ? { centroGeralId: categoria.centroGeralPadraoId } : {};
    await prisma.contaPagar.update({ where: { id: conta.id }, data: { categoriaId: categoria.id, ...centro, extracao: { ...log, categoriaDeclarada: true } as Prisma.InputJsonValue } });
    return pedirConfirmacaoConta(conta.id, identificador, "Categoria trocada, confere?");
  }
  if (pedido.tipo === "conta-centro") {
    const centro = await prisma.centroGeral.findFirst({ where: { id: pedido.centroGeralId, ativo: true } });
    if (!centro) return { mensagem: "Não achei esse centro — toque em trocar de novo." };
    await prisma.contaPagar.update({
      where: { id: conta.id },
      data: { centroGeralId: centro.id, negocioId: null, extracao: { ...log, centroDeclarado: true } as Prisma.InputJsonValue },
    });
    return pedirConfirmacaoConta(conta.id, identificador, "Centro trocado, confere?");
  }

  switch (pedido.acao) {
    case "ok":
      return confirmarRascunhoConta(conta.id, identificador);
    case "x":
      return descartarRascunhoConta(conta.id);
    case "co":
      await renovar(conta.id);
      return perguntarOQueCorrigir();
    case "ng":
      await renovar(conta.id);
      return { mensagem: "Qual negócio? Me diga o nome do cliente ou da obra (texto ou áudio) que eu vinculo." };
    case "re":
      return pedirConfirmacaoConta(conta.id, identificador);
    case "vc": {
      const { categorias } = await carregarCadastrosDespesa();
      return { mensagem: "Escolha a categoria:", botoes: botoesDeCategoriasConta(conta.id, categorias, conta.categoriaId) };
    }
    case "vg": {
      const { centrosGerais } = await carregarCadastrosDespesa();
      return { mensagem: "Escolha o centro de custo:", botoes: botoesDeCentrosConta(conta.id, centrosGerais, conta.negocioId ? null : conta.centroGeralId) };
    }
  }
}
