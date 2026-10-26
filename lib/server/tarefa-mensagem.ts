import "server-only";
import { prisma } from "@/lib/db";
import { cancelarMensagemAgendadaPendente, criarMensagemAgendada, encontrarOuCriarConversaDoContato } from "@/lib/server/conversas";
import { contatoDaTarefa, validarMensagemDaTarefa } from "@/lib/utils/mensagem-tarefa";

// Mensagem de WhatsApp agendada a partir de uma tarefa (pedido do Marcos em
// 26/10/2026), em tarefa avulsa ou de negócio. Vai pro contato da tarefa (o
// dela, o da conversa de onde veio ou o do negócio) pela mesma fila das
// agendadas do Atendimento: no horário, vira mensagem de saída e o
// whatsapp-service envia. A mensagem guarda a tarefa de onde saiu
// (MensagemAgendada.tarefaId, migração 20261026120000): cada tarefa mostra
// só as dela — várias tarefas do mesmo negócio têm o mesmo contato.

const CONTATO = { select: { id: true, nome: true, telefone: true } } as const;
const DESTINO_DA_TAREFA = { contato: CONTATO, conversa: { select: { contato: CONTATO } }, negocio: { select: { contato: CONTATO } } } as const;

export type ContatoDaMensagem = { id: string; nome: string; telefone: string | null };
export type AgendadaDaTarefa = { id: string; texto: string; agendadaPara: Date; status: "PENDENTE" | "ENVIADA" | "CANCELADA" };
export type MensagensDaTarefa = { destino: ContatoDaMensagem | null; agendadas: AgendadaDaTarefa[] };

/** As que já saíram continuam aparecendo na tarefa por uma semana (pra ver que foi). */
const MOSTRAR_ENVIADAS_MS = 7 * 24 * 60 * 60 * 1000;

/** Pra telas: pra quem vai e as agendadas (pendentes + enviadas na última semana) de cada tarefa. */
export async function mensagensDasTarefas(tarefaIds: string[]): Promise<Record<string, MensagensDaTarefa>> {
  if (!tarefaIds.length) return {};
  const tarefas = await prisma.tarefa.findMany({ where: { id: { in: tarefaIds } }, select: { id: true, ...DESTINO_DA_TAREFA } });
  const destinos = new Map(tarefas.map((t) => [t.id, contatoDaTarefa(t)]));
  const agendadas = await prisma.mensagemAgendada.findMany({
    where: {
      tarefaId: { in: tarefaIds },
      OR: [{ status: "PENDENTE" }, { status: "ENVIADA", agendadaPara: { gte: new Date(Date.now() - MOSTRAR_ENVIADAS_MS) } }],
    },
    orderBy: { agendadaPara: "asc" },
    select: { id: true, texto: true, agendadaPara: true, status: true, tarefaId: true },
  });
  const resultado: Record<string, MensagensDaTarefa> = {};
  for (const id of tarefaIds) {
    resultado[id] = {
      destino: destinos.get(id) ?? null,
      agendadas: agendadas.filter((a) => a.tarefaId === id).map((a) => ({ id: a.id, texto: a.texto, agendadaPara: a.agendadaPara, status: a.status })),
    };
  }
  return resultado;
}

/** Contato pro qual dá pra mandar (tem telefone), ou o motivo de não dar. */
function conferirTelefone(contato: ContatoDaMensagem): string | null {
  return contato.telefone ? null : `${contato.nome} não tem telefone cadastrado — cadastre o WhatsApp antes de agendar.`;
}

/**
 * Agenda numa tarefa que já existe. Tarefa sem contato (avulsa, sem
 * negócio): precisa escolher o contato, que passa a ser o da tarefa.
 */
export async function agendarMensagemDaTarefa(input: {
  tarefaId: string;
  texto: string;
  quando: Date | null;
  usuarioId: string;
  contatoId?: string | null;
}): Promise<{ ok: true; contatoNome: string; agendadaPara: Date } | { ok: false; error: string }> {
  const tarefa = await prisma.tarefa.findUnique({ where: { id: input.tarefaId }, select: { prazo: true, ...DESTINO_DA_TAREFA } });
  if (!tarefa) return { ok: false, error: "Tarefa não encontrada." };
  const v = validarMensagemDaTarefa({ texto: input.texto, quando: input.quando, prazo: tarefa.prazo, agora: new Date() });
  if ("erro" in v) return { ok: false, error: v.erro };

  let contato = contatoDaTarefa(tarefa);
  const vincular = !contato;
  if (!contato) {
    if (!input.contatoId) return { ok: false, error: "Essa tarefa não tem contato — escolha pra quem vai a mensagem." };
    contato = await prisma.contato.findUnique({ where: { id: input.contatoId }, ...CONTATO });
    if (!contato) return { ok: false, error: "Contato não encontrado." };
  }
  const semTelefone = conferirTelefone(contato);
  if (semTelefone) return { ok: false, error: semTelefone };

  const conversa = await encontrarOuCriarConversaDoContato(contato.id);
  if (vincular) await prisma.tarefa.update({ where: { id: input.tarefaId }, data: { contatoId: contato.id } });
  await criarMensagemAgendada({ conversaId: conversa.id, texto: v.texto, agendadaPara: v.quando, criadaPorId: input.usuarioId, tarefaId: input.tarefaId });
  return { ok: true, contatoNome: contato.nome, agendadaPara: v.quando };
}

/**
 * Pra criar a tarefa já com a mensagem: confere tudo ANTES de criar a tarefa
 * (texto, horário e um contato com telefone — o do negócio ou o escolhido),
 * pra não sobrar tarefa criada sem a mensagem pedida.
 */
export async function conferirMensagemDeNovaTarefa(input: {
  texto: string;
  quando: Date | null;
  prazo: Date;
  negocioId?: string | null;
  contatoId?: string | null;
}): Promise<string | null> {
  const v = validarMensagemDaTarefa({ texto: input.texto, quando: input.quando, prazo: input.prazo, agora: new Date() });
  if ("erro" in v) return v.erro;
  const doNegocio = input.negocioId ? (await prisma.negocio.findUnique({ where: { id: input.negocioId }, select: { contato: CONTATO } }))?.contato : null;
  if (input.negocioId && !doNegocio) return "Esse negócio não tem contato — a mensagem não tem pra quem ir.";
  const contato = doNegocio ?? (input.contatoId ? await prisma.contato.findUnique({ where: { id: input.contatoId }, ...CONTATO }) : null);
  if (!contato) return "Escolha pra quem vai a mensagem.";
  return conferirTelefone(contato);
}

export async function cancelarMensagemDaTarefa(mensagemId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return (await cancelarMensagemAgendadaPendente(mensagemId)) ? { ok: true } : { ok: false, error: "Essa mensagem já foi enviada (ou cancelada)." };
}

/** Busca leve de contatos COM telefone, por nome ou pelos dígitos do telefone (pro seletor da tarefa avulsa). */
export function buscarContatosComTelefone(termo: string) {
  const t = termo.trim();
  const digitos = t.replace(/\D/g, "");
  if (t.length < 2) return Promise.resolve([] as ContatoDaMensagem[]);
  return prisma.contato.findMany({
    where: {
      telefone: { not: null },
      OR: [
        { nome: { contains: t, mode: "insensitive" } },
        { razaoSocial: { contains: t, mode: "insensitive" } },
        // Telefone só quando digitou um número ("9988", "(55) 9 9988"), não num nome com número no meio.
        ...(digitos.length >= 4 && /^[\d\s()+-]+$/.test(t) ? [{ telefone: { contains: digitos } }] : []),
      ],
    },
    select: { id: true, nome: true, telefone: true },
    orderBy: { nome: "asc" },
    take: 8,
  });
}
