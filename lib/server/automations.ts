import "server-only";
import { prisma } from "@/lib/db";
import { URL_BASE } from "@/lib/constants/app";
import { gerarContrato } from "@/lib/server/contratos";

// Derivado do client de verdade (com a extensão de soft-delete de Negocio
// aplicada em lib/db.ts) em vez de Prisma.TransactionClient genérico — os
// dois tipos divergem depois de um $extends, e um `tx` vindo de
// prisma.$transaction(...) só bate com este.
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Toda automação cria tarefas para a Dani, conforme a especificação (§4.4).
const RESPONSAVEL_AUTOMATICO_USERNAME = "dani";

async function getResponsavelAutomatico(tx: Tx) {
  return tx.user.findUniqueOrThrow({ where: { username: RESPONSAVEL_AUTOMATICO_USERNAME } });
}

/**
 * Reage a uma mudança de etapa de um negócio, aplicando as regras da tabela
 * de automações da especificação. Deve ser chamada sempre logo após o campo
 * `etapaId` do negócio já ter sido atualizado, dentro da mesma transação.
 */
export async function onNegocioEtapaChanged(tx: Tx, negocioId: string, novaEtapaId: string): Promise<void> {
  const etapa = await tx.etapa.findUniqueOrThrow({ where: { id: novaEtapaId }, include: { funil: true } });
  const negocio = await tx.negocio.findUniqueOrThrow({ where: { id: negocioId } });

  if (etapa.tipo === "GANHO") {
    await handleNegocioGanho(tx, negocio);
    return;
  }

  if (etapa.nome === "Pagamento") {
    await criarTarefaAutomatica(tx, {
      titulo: "Emitir nota fiscal e boleto",
      negocioId: negocio.id,
      contatoId: negocio.contatoId,
      solicitanteId: negocio.responsavelId,
      prazoEmHoras: 24,
    });
    return;
  }

  if (etapa.nome === "Entrega") {
    await criarTarefaAutomatica(tx, {
      titulo: "Agendar instalação",
      negocioId: negocio.id,
      contatoId: negocio.contatoId,
      solicitanteId: negocio.responsavelId,
      prazoEmHoras: 48,
    });
    return;
  }

  if (etapa.nome === "Avaliação") {
    await criarTarefaAutomatica(tx, {
      titulo: "Solicitar avaliação do cliente",
      negocioId: negocio.id,
      contatoId: negocio.contatoId,
      solicitanteId: negocio.responsavelId,
      prazoEmHoras: 48,
    });
    return;
  }

  // Compras / Produção (pós-venda): movimentação manual, sem automação de
  // transição — no-op intencional (spec §4.4).
}

async function handleNegocioGanho(
  tx: Tx,
  negocioOriginal: {
    id: string;
    titulo: string;
    contatoId: string | null;
    valorCentavos: number;
    responsavelId: string;
    origem: string | null;
    produto: string | null;
    descricao: string | null;
    formaPagamento: string | null;
  },
): Promise<void> {
  const funilPosVenda = await tx.funil.findFirstOrThrow({ where: { nome: "Funil de pós-venda" } });
  const etapaContrato = await tx.etapa.findFirstOrThrow({ where: { funilId: funilPosVenda.id, nome: "Contrato" } });

  const negocioPosVenda = await tx.negocio.create({
    data: {
      titulo: `${negocioOriginal.titulo} — Pós-venda`,
      contatoId: negocioOriginal.contatoId,
      funilId: funilPosVenda.id,
      etapaId: etapaContrato.id,
      valorCentavos: negocioOriginal.valorCentavos,
      responsavelId: negocioOriginal.responsavelId,
      origem: negocioOriginal.origem,
      // Copiados pro contrato conseguir usar produto/forma de pagamento de
      // verdade — sem isso o negócio de pós-venda nascia em branco e o
      // contrato caía nos valores padrão mesmo com o gate já validado.
      produto: negocioOriginal.produto,
      descricao: negocioOriginal.descricao,
      formaPagamento: negocioOriginal.formaPagamento,
    },
  });

  const responsavelAutomatico = await getResponsavelAutomatico(tx);
  const contrato = await gerarContrato(negocioPosVenda.id, tx);
  const linkContrato = `${URL_BASE}/api/pdf/contrato/${contrato.id}`;
  await tx.tarefa.create({
    data: {
      titulo: "Emissão de contrato",
      negocioId: negocioPosVenda.id,
      contatoId: negocioOriginal.contatoId,
      responsavelId: responsavelAutomatico.id,
      solicitanteId: negocioOriginal.responsavelId,
      prazo: new Date(Date.now() + 24 * 60 * 60 * 1000),
      automatica: true,
      descricao:
        `Gerado automaticamente após o negócio de venda ser marcado como Ganho.\n\n` +
        `Modelo de contrato pronto pra revisar e baixar: ${linkContrato}\n` +
        `(é um rascunho — revise cláusulas e forma de pagamento antes de mandar pro cliente assinar)`,
    },
  });

  await tx.atividade.createMany({
    data: [
      { negocioId: negocioOriginal.id, tipo: "SISTEMA", texto: "Negócio marcado como Ganho. Pós-venda criado automaticamente." },
      { negocioId: negocioPosVenda.id, tipo: "SISTEMA", texto: "Negócio de pós-venda criado automaticamente a partir do fechamento da venda." },
    ],
  });
}

async function criarTarefaAutomatica(
  tx: Tx,
  input: { titulo: string; negocioId: string; contatoId: string | null; solicitanteId: string; prazoEmHoras: number },
): Promise<void> {
  const responsavelAutomatico = await getResponsavelAutomatico(tx);
  await tx.tarefa.create({
    data: {
      titulo: input.titulo,
      negocioId: input.negocioId,
      contatoId: input.contatoId,
      responsavelId: responsavelAutomatico.id,
      solicitanteId: input.solicitanteId,
      prazo: new Date(Date.now() + input.prazoEmHoras * 60 * 60 * 1000),
      automatica: true,
    },
  });
  await tx.atividade.create({
    data: { negocioId: input.negocioId, tipo: "SISTEMA", texto: `Tarefa automática criada: "${input.titulo}".` },
  });
}

/**
 * Reage à conclusão de uma tarefa. Hoje só a tarefa automática "Emissão de
 * contrato" dispara algo: avança o negócio para a etapa Pagamento.
 */
export async function onTarefaConcluida(tx: Tx, tarefaId: string): Promise<void> {
  const tarefa = await tx.tarefa.findUniqueOrThrow({ where: { id: tarefaId } });
  if (!tarefa.automatica || tarefa.titulo !== "Emissão de contrato" || !tarefa.negocioId) {
    return;
  }

  const negocio = await tx.negocio.findUniqueOrThrow({ where: { id: tarefa.negocioId } });
  const etapaPagamento = await tx.etapa.findFirstOrThrow({ where: { funilId: negocio.funilId, nome: "Pagamento" } });

  await tx.negocio.update({
    where: { id: negocio.id },
    data: { etapaId: etapaPagamento.id, dataEntradaNaEtapa: new Date() },
  });
  // Reaproveita o motor de automações para consistência, mesmo que Pagamento
  // hoje não dispare nenhuma regra adicional.
  await onNegocioEtapaChanged(tx, negocio.id, etapaPagamento.id);
  await tx.atividade.create({
    data: { negocioId: negocio.id, tipo: "SISTEMA", texto: "Contrato emitido. Negócio avançado para Pagamento." },
  });
}

/**
 * Ação manual explícita (botão na tela do negócio) — não é disparada por
 * arrastar o card no Kanban. Avança para Compras + cria tarefa "Iniciar compras".
 */
export async function marcarPagamentoIdentificado(negocioId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const negocio = await tx.negocio.findUniqueOrThrow({ where: { id: negocioId } });
    const etapaCompras = await tx.etapa.findFirstOrThrow({ where: { funilId: negocio.funilId, nome: "Compras" } });

    await tx.negocio.update({
      where: { id: negocioId },
      data: { etapaId: etapaCompras.id, dataEntradaNaEtapa: new Date() },
    });

    const responsavelAutomatico = await getResponsavelAutomatico(tx);
    await tx.tarefa.create({
      data: {
        titulo: "Iniciar compras",
        negocioId,
        contatoId: negocio.contatoId,
        responsavelId: responsavelAutomatico.id,
        solicitanteId: negocio.responsavelId,
        prazo: new Date(Date.now() + 48 * 60 * 60 * 1000),
        automatica: true,
      },
    });
    await tx.atividade.create({
      data: { negocioId, tipo: "SISTEMA", texto: "Pagamento identificado. Negócio avançado para Compras." },
    });
  });
}
