import "server-only";
import { prisma } from "@/lib/db";

/**
 * Única superfície que deve tocar as tabelas Conversa/Mensagem. Quando a
 * futura extensão de WhatsApp for construída, ela vai chamar estas mesmas
 * funções a partir de novas rotas de API — nenhuma mudança de schema ou de
 * regra de negócio deve ser necessária.
 */

export type EscopoConversa = "minhas" | "fila" | "todas";

function normalizarTelefone(telefone: string): string {
  return telefone.replace(/\D/g, "");
}

/**
 * Ponto de entrada da futura extensão de WhatsApp: acha a conversa de um
 * telefone (criando Contato + Conversa se for a primeira vez que esse
 * número aparece). Novos contatos caem na fila do setor de
 * Atendimento/Pré-vendas, igual a um lead chegando do zero.
 */
export async function encontrarOuCriarConversaPorTelefone(input: {
  telefone: string;
  nomeContato?: string;
}) {
  const telefone = normalizarTelefone(input.telefone);

  const contatoExistente = await prisma.contato.findUnique({
    where: { telefone },
    include: { conversas: true },
  });

  if (contatoExistente) {
    const conversaExistente = contatoExistente.conversas[0];
    if (conversaExistente) return conversaExistente;

    const setorPadrao = await prisma.setor.findFirstOrThrow({
      where: { nome: "Atendimento/Pré-vendas" },
    });
    return prisma.conversa.create({
      data: { contatoId: contatoExistente.id, setorId: setorPadrao.id },
    });
  }

  const setorPadrao = await prisma.setor.findFirstOrThrow({
    where: { nome: "Atendimento/Pré-vendas" },
  });
  const contato = await prisma.contato.create({
    data: { telefone, nome: input.nomeContato?.trim() || telefone },
  });
  return prisma.conversa.create({
    data: { contatoId: contato.id, setorId: setorPadrao.id },
  });
}

export function listConversas(input: { escopo: EscopoConversa; setorId?: string; userId: string }) {
  return prisma.conversa.findMany({
    where: {
      setorId: input.setorId || undefined,
      ...(input.escopo === "minhas" ? { atendenteId: input.userId } : {}),
      ...(input.escopo === "fila" ? { status: "FILA" as const } : {}),
    },
    include: {
      contato: true,
      setor: true,
      atendente: true,
      mensagens: { orderBy: { enviadaEm: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export function getConversaDetalhada(conversaId: string) {
  return prisma.conversa.findUnique({
    where: { id: conversaId },
    include: {
      contato: true,
      setor: true,
      atendente: true,
      mensagens: { orderBy: { enviadaEm: "asc" }, include: { autor: true } },
      notas: { orderBy: { criadaEm: "desc" }, include: { autor: true } },
      mensagensAgendadas: { orderBy: { agendadaPara: "asc" } },
    },
  });
}

export function encontrarMensagemPorExternalId(externalId: string) {
  return prisma.mensagem.findUnique({ where: { externalId } });
}

// Se uma mensagem foi entregue de verdade pelo Baileys mas a chamada de
// confirmar-envio falhou/demorou (rede instável, por exemplo), ela ainda
// aparece como "pendente" pro relay — sem essa janela, o próximo ciclo de
// 5s a reenviaria de verdade pro cliente. Visto ao vivo em 2026-09-03:
// 2 clientes reais receberam orçamento duplicado por causa disso.
const JANELA_TENTATIVA_ENVIO_MS = 90 * 1000;

/**
 * Mensagens de saída que ainda não foram de fato entregues pelo WhatsApp
 * real (criadas pelo composer do Atendimento ou por uma mensagem agendada
 * que venceu) — o relay do WhatsApp consome essa fila e retransmite pra
 * conversa real, depois confirma via `confirmarEnvioMensagem`. "Reserva"
 * (marca `tentativaEnvioEm`) cada mensagem retornada, pra não entregar a
 * mesma pendência de novo pro relay antes de dar tempo da confirmação
 * chegar — ver `JANELA_TENTATIVA_ENVIO_MS`.
 */
export async function listMensagensPendentesDeRelay() {
  const limiteTentativa = new Date(Date.now() - JANELA_TENTATIVA_ENVIO_MS);
  const pendentes = await prisma.mensagem.findMany({
    where: {
      direcao: "SAIDA",
      origem: { not: "WHATSAPP" },
      externalId: null,
      OR: [{ tentativaEnvioEm: null }, { tentativaEnvioEm: { lt: limiteTentativa } }],
    },
    include: { conversa: { include: { contato: true } } },
    orderBy: { enviadaEm: "asc" },
  });
  if (pendentes.length > 0) {
    await prisma.mensagem.updateMany({
      where: { id: { in: pendentes.map((m) => m.id) } },
      data: { tentativaEnvioEm: new Date() },
    });
  }
  return pendentes;
}

export function confirmarEnvioMensagem(mensagemId: string, externalId: string) {
  return prisma.mensagem.update({ where: { id: mensagemId }, data: { externalId } });
}

export async function registrarMensagem(input: {
  conversaId: string;
  texto: string;
  direcao: "ENTRADA" | "SAIDA";
  origem?: "MANUAL" | "SISTEMA" | "WHATSAPP";
  autorUserId?: string;
  externalId?: string;
  enviadaEm?: Date;
  anexoUrl?: string;
  anexoNome?: string;
  anexoMimetype?: string;
  contatoCompartilhadoNome?: string;
  contatoCompartilhadoTelefone?: string;
}) {
  const mensagem = await prisma.mensagem.create({
    data: {
      conversaId: input.conversaId,
      texto: input.texto,
      direcao: input.direcao,
      origem: input.origem ?? "MANUAL",
      autorUserId: input.autorUserId,
      externalId: input.externalId,
      enviadaEm: input.enviadaEm,
      anexoUrl: input.anexoUrl,
      anexoNome: input.anexoNome,
      anexoMimetype: input.anexoMimetype,
      contatoCompartilhadoNome: input.contatoCompartilhadoNome,
      contatoCompartilhadoTelefone: input.contatoCompartilhadoTelefone,
    },
  });
  await prisma.conversa.update({ where: { id: input.conversaId }, data: { updatedAt: new Date() } });
  return mensagem;
}

export function assumirConversa(conversaId: string, userId: string) {
  return prisma.conversa.update({
    where: { id: conversaId },
    data: { atendenteId: userId, status: "ATENDENDO" },
  });
}

export function transferirConversa(
  conversaId: string,
  input: { setorId?: string; atendenteId?: string | null },
) {
  return prisma.conversa.update({
    where: { id: conversaId },
    data: {
      setorId: input.setorId,
      atendenteId: input.atendenteId,
      status: input.atendenteId ? "ATENDENDO" : "FILA",
    },
  });
}

export function criarNotaInterna(conversaId: string, autorId: string, texto: string) {
  return prisma.notaInterna.create({ data: { conversaId, autorId, texto } });
}

export function criarMensagemAgendada(input: {
  conversaId: string;
  texto: string;
  agendadaPara: Date;
  criadaPorId: string;
}) {
  return prisma.mensagemAgendada.create({ data: input });
}

export function cancelarMensagemAgendada(id: string) {
  return prisma.mensagemAgendada.update({ where: { id }, data: { status: "CANCELADA" } });
}

/** Mensagens agendadas pendentes de um contato pelo telefone (extensão de WhatsApp). */
export async function listMensagensAgendadasPorTelefone(telefone: string) {
  const contato = await prisma.contato.findUnique({
    where: { telefone: normalizarTelefone(telefone) },
    include: { conversas: true },
  });
  const conversaId = contato?.conversas[0]?.id;
  if (!conversaId) return [];

  return prisma.mensagemAgendada.findMany({
    where: { conversaId, status: "PENDENTE" },
    orderBy: { agendadaPara: "asc" },
  });
}

/**
 * Envia (converte em Mensagem) qualquer agendada cujo horário já passou.
 * Placeholder: sem canal de envio real ainda, então "enviar" aqui só marca
 * como enviada e cria a mensagem correspondente. Chamado oportunisticamente
 * ao abrir o módulo de Atendimento; um scheduler real (ou a futura extensão)
 * deve substituir isso depois.
 */
export async function processarMensagensAgendadasVencidas(): Promise<void> {
  const vencidas = await prisma.mensagemAgendada.findMany({
    where: { status: "PENDENTE", agendadaPara: { lte: new Date() } },
  });
  for (const agendada of vencidas) {
    await prisma.$transaction([
      prisma.mensagem.create({
        data: {
          conversaId: agendada.conversaId,
          texto: agendada.texto,
          direcao: "SAIDA",
          origem: "SISTEMA",
        },
      }),
      prisma.mensagemAgendada.update({ where: { id: agendada.id }, data: { status: "ENVIADA" } }),
    ]);
  }
}
