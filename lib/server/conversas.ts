import "server-only";
import { prisma } from "@/lib/db";

/**
 * Única superfície que deve tocar as tabelas Conversa/Mensagem. Quando a
 * futura extensão de WhatsApp for construída, ela vai chamar estas mesmas
 * funções a partir de novas rotas de API — nenhuma mudança de schema ou de
 * regra de negócio deve ser necessária.
 */

export type EscopoConversa = "minhas" | "fila" | "todas";

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

export async function registrarMensagem(input: {
  conversaId: string;
  texto: string;
  direcao: "ENTRADA" | "SAIDA";
  origem?: "MANUAL" | "SISTEMA" | "WHATSAPP";
  autorUserId?: string;
}) {
  const mensagem = await prisma.mensagem.create({
    data: {
      conversaId: input.conversaId,
      texto: input.texto,
      direcao: input.direcao,
      origem: input.origem ?? "MANUAL",
      autorUserId: input.autorUserId,
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
