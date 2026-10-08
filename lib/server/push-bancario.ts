import "server-only";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { criarDespesa } from "@/lib/server/despesas";
import { carregarCadastrosDespesa, pedirConfirmacao, type RespostaDespesa } from "@/lib/server/despesa-agente";
import { diaBrasilia, somarDias } from "@/lib/utils/brasilia";
import { dataDaDespesa } from "@/lib/utils/despesas";
import { botoesDeParecida, montarDespesaDaMensagem, negociosParecidos } from "@/lib/utils/despesa-agente";
import { semVendaComPosVenda } from "@/lib/utils/negocio-pos-venda";
import { botoesDeEntrada, lerPushSicredi, negocioDoAviso, type PushLido } from "@/lib/utils/push-sicredi";
import type { PedidoBotao } from "@/lib/utils/agente-canal";

// Push do app do Sicredi encaminhado pelo MacroDroid do celular do Marcos
// (pedido de 2026-10-07). Toda pergunta vai pro Telegram dele, nunca pro
// WhatsApp (que a Dani também vê):
// - SAÍDA: vira despesa esperando confirmação (origem PUSH) com os botões
//   de sempre; se já existe uma despesa do mesmo valor perto dessa data
//   (áudio, comprovante ou outro push), pergunta se é a mesma e junta.
// - ENTRADA: pergunta de qual negócio é; a resposta fica no AvisoBancario e
//   a conciliação pré-seleciona esse negócio quando o extrato chegar.
// Este arquivo não fala com o Telegram: devolve a mensagem e quem envia é
// a rota (app/api/push/sicredi).

/**
 * Chave que o MacroDroid manda no header Authorization. Derivada do
 * SESSION_SECRET (sem variável nova), ou PUSH_SICREDI_TOKEN se existir.
 * Só abre esta rota — não dá acesso a mais nada do CRM.
 */
export function tokenPush(): string {
  const proprio = process.env.PUSH_SICREDI_TOKEN?.trim();
  if (proprio) return proprio;
  const segredo = process.env.SESSION_SECRET;
  if (!segredo) throw new Error("SESSION_SECRET não configurado.");
  return crypto.createHmac("sha256", segredo).update("push-sicredi").digest("hex").slice(0, 40);
}

export function tokenPushConfere(header: string | null): boolean {
  const recebido = (header ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!recebido) return false;
  const esperado = Buffer.from(tokenPush());
  const veio = Buffer.from(recebido);
  return veio.length === esperado.length && crypto.timingSafeEqual(veio, esperado);
}

/** Quem recebe as perguntas do push: o administrador com Telegram ligado (hoje, o Marcos). */
export async function destinatarioDosAvisos() {
  return prisma.user.findFirst({
    where: { isAdmin: true, telegramId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { id: true, nome: true, telegramId: true },
  });
}

function reais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");
}

function quando(data: Date): string {
  return data.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", "");
}

export type ResultadoPush =
  | { status: "ignorado" | "duplicado" | "sem-destino" }
  | { status: "registrado"; avisoId: string; chatId: string; resposta: RespostaDespesa };

export async function processarPushBancario(input: { titulo: string | null; texto: string }): Promise<ResultadoPush> {
  const lido = lerPushSicredi(input.titulo, input.texto);
  if (!lido) {
    console.log("[push] ignorado: não é movimentação.");
    return { status: "ignorado" };
  }
  const destino = await destinatarioDosAvisos();
  if (!destino?.telegramId) {
    console.warn("[push] nenhum administrador com Telegram ligado — push não registrado.");
    return { status: "sem-destino" };
  }

  const hash = crypto.createHash("sha256").update(`${input.titulo ?? ""}\n${input.texto}`).digest("hex");
  const dataHora = lido.dataHora ? new Date(`${lido.dataHora}-03:00`) : new Date();
  let aviso;
  try {
    aviso = await prisma.avisoBancario.create({
      data: {
        hash,
        direcao: lido.direcao,
        valorCentavos: lido.valorCentavos,
        contraparte: lido.contraparte,
        documento: lido.documento,
        banco: lido.banco,
        dataHora,
        titulo: input.titulo,
        texto: input.texto,
      },
    });
  } catch (erro) {
    // O MacroDroid manda de novo quando a notificação é atualizada.
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") return { status: "duplicado" };
    throw erro;
  }

  const identificador = `tg:${destino.telegramId}`;
  const resposta =
    lido.direcao === "SAIDA"
      ? await avisoDeSaida(aviso.id, lido, dataHora, destino.id, identificador)
      : await avisoDeEntrada(aviso.id, lido, dataHora);
  return { status: "registrado", avisoId: aviso.id, chatId: destino.telegramId, resposta };
}

async function avisoDeSaida(avisoId: string, lido: PushLido, dataHora: Date, usuarioId: string, identificador: string): Promise<RespostaDespesa> {
  const dia = diaBrasilia(dataHora);
  const cadastros = await carregarCadastrosDespesa();
  // Só o nome de quem recebeu entra na dedução da categoria: o resto do
  // texto ("Banco Cooperativo Sicredi", "Pix") puxaria "Tarifas bancárias".
  const montada = montarDespesaDaMensagem({
    texto: lido.contraparte ?? "",
    origem: "PUSH",
    hoje: diaBrasilia(new Date()),
    extracao: { valor: lido.valorCentavos / 100, fornecedor: lido.contraparte ?? "", data: dia },
    ...cadastros,
  });

  // Mesmo gasto já lançado por áudio, comprovante ou outro push: mesmo valor
  // e até 3 dias de diferença. Nome não conta — o Pix traz a razão social, o
  // áudio traz o apelido ("posto do Vaccari") — por isso é uma pergunta.
  const parecida = await prisma.despesa.findFirst({
    where: {
      valorCentavos: lido.valorCentavos,
      data: { gte: dataDaDespesa(somarDias(dia, -3)), lte: dataDaDespesa(somarDias(dia, 3)) },
    },
    orderBy: { criadoEm: "desc" },
    select: { id: true, fornecedor: true, data: true, valorCentavos: true },
  });

  const despesa = await criarDespesa({
    ...montada.dados,
    origem: "PUSH",
    registradaPorId: usuarioId,
    rascunho: true,
    textoOriginal: [lido.contraparte, lido.documento, lido.banco].filter(Boolean).join(" · ") || null,
    extracao: {
      push: lido,
      avisoId,
      decisao: { categoriaDeclarada: false, centroDeclarado: false },
      centroDeclarado: false,
    } as unknown as Prisma.InputJsonValue,
    telefoneOrigem: identificador,
  });
  await prisma.avisoBancario.update({ where: { id: avisoId }, data: { despesaId: despesa.id } });

  const meio = lido.meio === "PIX" ? "Pix" : "Pagamento";
  const intro = `🔔 ${meio} de *${reais(lido.valorCentavos)}* para ${lido.contraparte ?? "?"} (${quando(dataHora)}).`;
  if (parecida) {
    const diaParecida = diaBrasilia(parecida.data).split("-").reverse().slice(0, 2).join("/");
    return {
      mensagem: `${intro}\n\n⚠️ Parece a despesa já lançada: *${reais(parecida.valorCentavos)}* — ${parecida.fornecedor || "sem fornecedor"} (${diaParecida}). É o mesmo gasto?`,
      botoes: botoesDeParecida(despesa.id, parecida.id),
    };
  }
  return pedirConfirmacao(despesa.id, identificador, `${intro} O que foi? Confira:`);
}

async function avisoDeEntrada(avisoId: string, lido: PushLido, dataHora: Date): Promise<RespostaDespesa> {
  const negocios = await prisma.negocio.findMany({
    select: { id: true, titulo: true, valorCentavos: true, contato: { select: { nome: true } }, etapa: { select: { tipo: true } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  const abertos = semVendaComPosVenda(
    negocios
      .filter((n) => n.etapa?.tipo !== "PERDIDO")
      .map((n) => ({ id: n.id, titulo: n.titulo, valorCentavos: n.valorCentavos, contatoNome: n.contato?.nome ?? null })),
  );
  // Mesmo valor primeiro, depois o cliente com nome parecido com quem mandou,
  // e completa com os mais recentes.
  const escolhidos = new Map<string, { id: string; titulo: string }>();
  for (const n of abertos.filter((n) => n.valorCentavos === lido.valorCentavos)) escolhidos.set(n.id, n);
  if (lido.contraparte) for (const n of negociosParecidos(lido.contraparte, abertos, 4)) escolhidos.set(n.id, n);
  for (const n of abertos) {
    if (escolhidos.size >= 6) break;
    escolhidos.set(n.id, n);
  }

  return {
    mensagem: `💰 Pix recebido: *${reais(lido.valorCentavos)}* de ${lido.contraparte ?? "?"} (${quando(dataHora)}).\nDe qual negócio é? Fica anotado pra conciliação sugerir quando o extrato chegar.`,
    botoes: botoesDeEntrada(avisoId, [...escolhidos.values()].slice(0, 6)),
  };
}

/** Toque nos botões da entrada ("é desse negócio" / "não é de negócio"). Só vale na conversa de quem recebe os avisos. */
export async function responderBotaoAviso(pedido: PedidoBotao, identificador: string): Promise<RespostaDespesa | null> {
  if (pedido.tipo !== "aviso-negocio" && pedido.tipo !== "aviso-ignorar") return null;
  const destino = await destinatarioDosAvisos();
  if (!destino?.telegramId || identificador !== `tg:${destino.telegramId}`) return null;
  const aviso = await prisma.avisoBancario.findUnique({ where: { id: pedido.avisoId } });
  if (!aviso) return { mensagem: "Esse aviso não existe mais." };

  if (pedido.tipo === "aviso-ignorar") {
    await prisma.avisoBancario.update({ where: { id: aviso.id }, data: { status: "IGNORADO", negocioId: null } });
    return { mensagem: "Ok, fica sem negócio — na conciliação você classifica como quiser." };
  }
  const negocio = await prisma.negocio.findUnique({ where: { id: pedido.negocioId }, select: { id: true, titulo: true } });
  if (!negocio) return { mensagem: "Não achei mais esse negócio." };
  await prisma.avisoBancario.update({ where: { id: aviso.id }, data: { status: "RESPONDIDO", negocioId: negocio.id } });
  return { mensagem: `✅ Anotado: *${reais(aviso.valorCentavos)}* de ${aviso.contraparte ?? "?"} é do negócio *${negocio.titulo}*. Quando o extrato chegar, a conciliação já sugere esse negócio.` };
}

/**
 * Pra conciliação: linha de ENTRADA do extrato -> negócio que o Marcos disse
 * no push (mesmo valor, até 2 dias). Só pré-seleciona; conciliar continua
 * esperando o clique.
 */
export async function negociosDosAvisos(linhas: { id: string; dia: string; valorCentavos: number; tipo: "ENTRADA" | "SAIDA" }[]): Promise<Map<string, string>> {
  const entradas = linhas.filter((l) => l.tipo === "ENTRADA");
  const mapa = new Map<string, string>();
  if (!entradas.length) return mapa;
  const dias = entradas.map((l) => l.dia).sort();
  const avisos = await prisma.avisoBancario.findMany({
    where: {
      direcao: "ENTRADA",
      status: "RESPONDIDO",
      negocioId: { not: null },
      valorCentavos: { in: [...new Set(entradas.map((l) => l.valorCentavos))] },
      dataHora: { gte: dataDaDespesa(somarDias(dias[0], -3)), lte: dataDaDespesa(somarDias(dias[dias.length - 1], 3)) },
    },
    select: { negocioId: true, valorCentavos: true, dataHora: true },
  });
  const vm = avisos.map((a) => ({ negocioId: a.negocioId as string, valorCentavos: a.valorCentavos, dia: diaBrasilia(a.dataHora) }));
  for (const l of entradas) {
    const negocioId = negocioDoAviso(l, vm);
    if (negocioId) mapa.set(l.id, negocioId);
  }
  return mapa;
}
