import "server-only";
import type { FrequenciaCompromisso, RegraCompromisso } from "@prisma/client";
import { prisma } from "@/lib/db";
import { destinoDaAlteracao, horarioValido, inicioDoPeriodo } from "@/lib/utils/compromissos";

// Configuração dos Compromissos (Configurações > Compromissos, só admin).
// Nome, categoria e pessoas mudam direto; meta, dias úteis e horário de corte
// ficam em CompromissoVersao pra preservar o histórico (ver destinoDaAlteracao).

export function listCompromissosConfig() {
  return prisma.compromisso.findMany({
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    include: {
      categoria: { select: { id: true, nome: true, cor: true } },
      metaDe: { select: { id: true, nome: true } },
      usuarios: { include: { usuario: { select: { id: true, nome: true } } } },
      versoes: { orderBy: { vigenteDesde: "desc" } },
    },
  });
}

export type ParametrosCompromisso = { meta: number | null; diasUteis: number[]; horarioCorte: string | null };

function validarParametros(regra: RegraCompromisso, metaDeId: string | null, p: ParametrosCompromisso) {
  const dias = [...new Set(p.diasUteis)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (dias.length === 0) throw new Error("Escolha pelo menos um dia considerado.");
  if (regra === "CATEGORIA" || !metaDeId) {
    if (!Number.isInteger(p.meta) || (p.meta ?? 0) < 1) throw new Error("A meta precisa ser um número inteiro a partir de 1.");
  }
  if (regra === "PLANEJAR_DIA_SEGUINTE" && !horarioValido(p.horarioCorte)) throw new Error("Informe o horário de corte (HH:MM).");
  return {
    meta: regra === "PLANEJAR_DIA_SEGUINTE" && metaDeId ? null : p.meta,
    diasUteis: dias.sort((a, b) => a - b),
    horarioCorte: regra === "PLANEJAR_DIA_SEGUINTE" ? p.horarioCorte : null,
  };
}

export async function criarCompromisso(input: {
  nome: string;
  frequencia: FrequenciaCompromisso;
  regra: RegraCompromisso;
  categoriaId: string | null;
  metaDeId: string | null;
  usuarioIds: string[];
  parametros: ParametrosCompromisso;
}) {
  const nome = input.nome.trim();
  if (!nome) throw new Error("Dê um nome para o compromisso.");
  if (!input.categoriaId) throw new Error("Escolha a categoria de tarefa que conta.");
  if (input.usuarioIds.length === 0) throw new Error("Escolha pelo menos uma pessoa.");
  if (input.regra === "PLANEJAR_DIA_SEGUINTE" && input.frequencia !== "DIARIA") throw new Error("\"Planejar o dia seguinte\" é sempre diário.");
  const metaDeId = input.regra === "PLANEJAR_DIA_SEGUINTE" ? input.metaDeId : null;
  const parametros = validarParametros(input.regra, metaDeId, input.parametros);
  const ultimo = await prisma.compromisso.findFirst({ orderBy: { ordem: "desc" }, select: { ordem: true } });

  return prisma.compromisso.create({
    data: {
      nome,
      frequencia: input.frequencia,
      regra: input.regra,
      categoriaId: input.categoriaId,
      metaDeId,
      ordem: (ultimo?.ordem ?? 0) + 1,
      usuarios: { create: input.usuarioIds.map((usuarioId) => ({ usuarioId })) },
      // Nasce valendo do início do período atual (hoje ou esta semana).
      versoes: { create: { ...parametros, vigenteDesde: inicioDoPeriodo(input.frequencia, new Date()) } },
    },
  });
}

/** Nome, categoria, meta espelhada e pessoas — mudam sem versão. */
export async function atualizarCompromisso(
  id: string,
  dados: { nome: string; categoriaId: string | null; metaDeId: string | null; usuarioIds: string[] },
) {
  const nome = dados.nome.trim();
  if (!nome) throw new Error("Dê um nome para o compromisso.");
  if (!dados.categoriaId) throw new Error("Escolha a categoria de tarefa que conta.");
  if (dados.usuarioIds.length === 0) throw new Error("Escolha pelo menos uma pessoa.");
  const atual = await prisma.compromisso.findUniqueOrThrow({ where: { id } });
  if (dados.metaDeId === id) throw new Error("O compromisso não pode acompanhar a própria meta.");
  await prisma.$transaction([
    prisma.compromisso.update({
      where: { id },
      data: {
        nome,
        categoriaId: dados.categoriaId,
        metaDeId: atual.regra === "PLANEJAR_DIA_SEGUINTE" ? dados.metaDeId : null,
      },
    }),
    prisma.compromissoUsuario.deleteMany({ where: { compromissoId: id, usuarioId: { notIn: dados.usuarioIds } } }),
    ...dados.usuarioIds.map((usuarioId) =>
      prisma.compromissoUsuario.upsert({
        where: { compromissoId_usuarioId: { compromissoId: id, usuarioId } },
        create: { compromissoId: id, usuarioId },
        update: {},
      }),
    ),
  ]);
}

/** Meta, dias úteis e horário de corte: valem do período atual em diante (histórico preservado). */
export async function atualizarParametrosCompromisso(id: string, parametros: ParametrosCompromisso, agora = new Date()) {
  const compromisso = await prisma.compromisso.findUniqueOrThrow({ where: { id }, include: { versoes: true } });
  const validos = validarParametros(compromisso.regra, compromisso.metaDeId, parametros);
  const destino = destinoDaAlteracao(compromisso.frequencia, compromisso.versoes, agora);
  if (destino.tipo === "atualizar") {
    await prisma.compromissoVersao.update({ where: { id: destino.id }, data: validos });
  } else {
    await prisma.compromissoVersao.create({ data: { ...validos, compromissoId: id, vigenteDesde: destino.vigenteDesde } });
  }
}

export async function alternarAtivoCompromisso(id: string) {
  const atual = await prisma.compromisso.findUniqueOrThrow({ where: { id }, select: { ativo: true } });
  await prisma.compromisso.update({ where: { id }, data: { ativo: !atual.ativo } });
}

export async function moverCompromisso(id: string, direcao: "cima" | "baixo") {
  const todos = await prisma.compromisso.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true } });
  const idx = todos.findIndex((c) => c.id === id);
  const alvo = direcao === "cima" ? idx - 1 : idx + 1;
  if (idx < 0 || alvo < 0 || alvo >= todos.length) return;
  [todos[idx], todos[alvo]] = [todos[alvo], todos[idx]];
  await prisma.$transaction(todos.map((c, ordem) => prisma.compromisso.update({ where: { id: c.id }, data: { ordem: ordem + 1 } })));
}
