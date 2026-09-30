import "server-only";
import { prisma } from "@/lib/db";
import { diaBrasilia, inicioDaSemana, inicioDoDiaBrasilia, somarDias } from "@/lib/utils/brasilia";
import {
  avaliarDia,
  avaliarDiario,
  avaliarSemanal,
  estadoDoDia,
  execucaoDoPlano,
  inicioDoPeriodo,
  percentualCumprimento,
  proximoDiaUtil,
  sequenciaDeDias,
  tarefasQueContam,
  versaoVigente,
  type CompromissoParaCalculo,
  type ContextoCalculo,
  type ResultadoCompromisso,
  type StatusCompromisso,
} from "@/lib/utils/compromissos";

// Dados do card "Compromissos" do Painel (etapa 4 do pedido de 2026-09-30).
// Tudo calculado na hora a partir das tarefas da pessoa (responsável) —
// concluir/reabrir reflete imediatamente; metas vêm das versões da época.

const DIAS_GRADE = 28; // 4 semanas
const LIMITE_SEQUENCIA_DIAS = 400;

export type ItemPainel = ResultadoCompromisso & { categoriaCor: string | null };
export type Contagem = { cumpridos: number; avaliados: number };

export type PainelCompromissos = {
  usuario: { id: string; nome: string };
  hoje: { dia: string; itens: ItemPainel[] };
  semana: { inicio: string; fim: string; itens: ItemPainel[] };
  sequencia: number;
  /** Botão "Planejar amanhã": categoria e dia (próximo dia útil). */
  planejar: { categoriaId: string; diaAlvo: string } | null;
  grade: { dia: string; estado: StatusCompromisso | "sem" | "futuro"; itens: { nome: string; realizado: number; meta: number; status: StatusCompromisso }[] }[];
  percentuais: { compromissoId: string; nome: string; frequencia: "DIARIA" | "SEMANAL"; semana: Contagem; mes: Contagem }[];
  taxaPlano: { dias: { dia: string; planejadas: number; executadas: number }[]; semana: { planejadas: number; executadas: number }; mes: { planejadas: number; executadas: number } } | null;
  metas: {
    compromissoId: string;
    nome: string;
    frequencia: "DIARIA" | "SEMANAL";
    versoes: { vigenteDesde: string; meta: number | null; metaDeNome: string | null; horarioCorte: string | null; diasUteis: number[] }[];
  }[];
};

function paraCalculo(c: {
  id: string;
  nome: string;
  frequencia: "DIARIA" | "SEMANAL";
  regra: "CATEGORIA" | "PLANEJAR_DIA_SEGUINTE";
  categoriaId: string | null;
  metaDeId: string | null;
  versoes: { vigenteDesde: Date; meta: number | null; diasUteis: number[]; horarioCorte: string | null }[];
}): CompromissoParaCalculo {
  return {
    id: c.id,
    nome: c.nome,
    frequencia: c.frequencia,
    regra: c.regra,
    categoriaId: c.categoriaId,
    metaDeId: c.metaDeId,
    versoes: c.versoes.map((v) => ({ vigenteDesde: v.vigenteDesde, meta: v.meta, diasUteis: v.diasUteis, horarioCorte: v.horarioCorte })),
  };
}

/** Quem tem compromisso ativo (pro seletor do administrador no Painel). */
export function listUsuariosComCompromissos() {
  return prisma.user.findMany({
    where: { compromissos: { some: { compromisso: { ativo: true } } } },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });
}

export async function getPainelCompromissos(usuarioId: string, agora: Date = new Date()): Promise<PainelCompromissos | null> {
  const [usuario, todos] = await Promise.all([
    prisma.user.findUnique({ where: { id: usuarioId }, select: { id: true, nome: true } }),
    prisma.compromisso.findMany({
      where: { ativo: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      include: {
        categoria: { select: { cor: true } },
        metaDe: { select: { nome: true } },
        usuarios: { select: { usuarioId: true } },
        versoes: { orderBy: { vigenteDesde: "desc" } },
      },
    }),
  ]);
  if (!usuario) return null;
  const meus = todos.filter((c) => c.usuarios.some((u) => u.usuarioId === usuarioId));
  if (meus.length === 0) return null;

  const hoje = diaBrasilia(agora);
  const segunda = inicioDaSemana(hoje);
  const inicioGrade = somarDias(segunda, -(DIAS_GRADE - 7));
  const primeiroDoMes = `${hoje.slice(0, 8)}01`;
  const primeiraVigencia = meus.flatMap((c) => c.versoes.map((v) => diaBrasilia(v.vigenteDesde))).sort()[0];
  const limite = somarDias(hoje, -LIMITE_SEQUENCIA_DIAS);
  // Janela das tarefas: o que for mais antigo entre grade, mês e início dos compromissos (pra sequência).
  const inicioJanela = [inicioGrade, inicioDaSemana(primeiroDoMes), primeiraVigencia > limite ? primeiraVigencia : limite].sort()[0];
  const categorias = [...new Set(meus.map((c) => c.categoriaId).filter((id): id is string => !!id))];

  const tarefas = await prisma.tarefa.findMany({
    where: {
      responsavelId: usuarioId,
      categoriaId: { in: categorias },
      OR: [{ concluidaEm: { gte: inicioDoDiaBrasilia(inicioJanela) } }, { prazo: { gte: inicioDoDiaBrasilia(inicioJanela) } }],
    },
    select: { categoriaId: true, prazo: true, concluidaEm: true, prazoDefinidoEm: true },
  });

  const calculo = meus.map(paraCalculo);
  const ctx: ContextoCalculo = { compromissos: todos.map(paraCalculo), tarefas, agora };
  const corPorId = new Map(meus.map((c) => [c.id, c.categoria?.cor ?? null]));
  const comCor = (r: ResultadoCompromisso): ItemPainel => ({ ...r, categoriaCor: corPorId.get(r.compromissoId) ?? null });

  const diarios = calculo.filter((c) => c.frequencia === "DIARIA");
  const semanais = calculo.filter((c) => c.frequencia === "SEMANAL");
  const diasAte = (inicio: string) => {
    const dias: string[] = [];
    for (let d = inicio; d <= hoje; d = somarDias(d, 1)) dias.push(d);
    return dias;
  };
  const diasDaSemana = diasAte(segunda);
  const diasDoMes = diasAte(primeiroDoMes);
  // Semanas do mês: da que contém o dia 1 até a atual.
  const segundasDoMes: string[] = [];
  for (let s = inicioDaSemana(primeiroDoMes); s <= segunda; s = somarDias(s, 7)) segundasDoMes.push(s);

  // Planejar amanhã: o compromisso de planejar da pessoa (se houver) diz a categoria e o próximo dia útil.
  const planejar = diarios.find((c) => c.regra === "PLANEJAR_DIA_SEGUINTE" && c.categoriaId);
  const versaoPlanejar = planejar ? versaoVigente(planejar.versoes, inicioDoPeriodo("DIARIA", agora)) : null;

  const grade = Array.from({ length: DIAS_GRADE }, (_, i) => somarDias(inicioGrade, i)).map((dia) => {
    if (dia > hoje) return { dia, estado: "futuro" as const, itens: [] };
    const resultados = avaliarDia(diarios, dia, ctx);
    return {
      dia,
      estado: estadoDoDia(resultados),
      itens: resultados.map((r) => ({ nome: r.nome, realizado: r.realizado, meta: r.meta, status: r.status })),
    };
  });

  const taxaPlano = planejar?.categoriaId
    ? (() => {
        const dias = grade.filter((g) => g.dia <= hoje).map((g) => ({ dia: g.dia, ...execucaoDoPlano(planejar.categoriaId!, g.dia, tarefas) }));
        const somar = (lista: string[]) =>
          lista
            .map((d) => execucaoDoPlano(planejar.categoriaId!, d, tarefas))
            .reduce((acc, x) => ({ planejadas: acc.planejadas + x.planejadas, executadas: acc.executadas + x.executadas }), { planejadas: 0, executadas: 0 });
        return { dias, semana: somar(diasDaSemana), mes: somar(diasDoMes) };
      })()
    : null;

  const nomePorId = new Map(todos.map((c) => [c.id, c.nome]));

  return {
    usuario,
    hoje: { dia: hoje, itens: avaliarDia(diarios, hoje, ctx).map(comCor) },
    semana: {
      inicio: segunda,
      fim: somarDias(segunda, 6),
      itens: semanais.map((c) => avaliarSemanal(c, segunda, ctx)).filter((r): r is ResultadoCompromisso => r !== null).map(comCor),
    },
    sequencia: sequenciaDeDias(diarios, ctx, LIMITE_SEQUENCIA_DIAS),
    planejar:
      planejar?.categoriaId && versaoPlanejar ? { categoriaId: planejar.categoriaId, diaAlvo: proximoDiaUtil(hoje, versaoPlanejar.diasUteis) } : null,
    grade,
    percentuais: calculo.map((c) => ({
      compromissoId: c.id,
      nome: c.nome,
      frequencia: c.frequencia,
      semana:
        c.frequencia === "DIARIA"
          ? percentualCumprimento(diasDaSemana.map((d) => avaliarDiario(c, d, ctx)))
          : percentualCumprimento([avaliarSemanal(c, segunda, ctx)]),
      mes:
        c.frequencia === "DIARIA"
          ? percentualCumprimento(diasDoMes.map((d) => avaliarDiario(c, d, ctx)))
          : percentualCumprimento(segundasDoMes.map((s) => avaliarSemanal(c, s, ctx))),
    })),
    taxaPlano,
    metas: meus.map((c) => ({
      compromissoId: c.id,
      nome: c.nome,
      frequencia: c.frequencia,
      versoes: c.versoes.map((v) => ({
        vigenteDesde: v.vigenteDesde.toISOString(),
        meta: v.meta,
        metaDeNome: c.metaDeId ? (nomePorId.get(c.metaDeId) ?? null) : null,
        horarioCorte: v.horarioCorte,
        diasUteis: v.diasUteis,
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Link do card pra aba Tarefas: as tarefas que estão somando no compromisso.
// ---------------------------------------------------------------------------

export type FiltroTarefasCompromisso = {
  /** Frase explicando o que está sendo mostrado (ex.: "Gerar Receita em 30/09: concluídas no dia (1 de 2)"). */
  descricao: string;
  ids: string[];
  /** Pré-preenchimento do "Nova tarefa" na aba, pra já criar na categoria certa. */
  valoresIniciais?: { categoriaId?: string; prazo?: string; responsavelId?: string };
};

function ddmm(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/**
 * As tarefas da pessoa que somam no compromisso (ou em todos os diários, com
 * compromissoId "diarios") no dia — ou na semana do dia, nos semanais. Mesmo
 * critério do progresso (tarefasQueContam).
 */
export async function getFiltroTarefasCompromisso(params: {
  usuarioId: string;
  compromissoId: string;
  dia: string;
  agora?: Date;
}): Promise<FiltroTarefasCompromisso | null> {
  const agora = params.agora ?? new Date();
  const todos = await prisma.compromisso.findMany({
    where: { ativo: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    include: { versoes: true, usuarios: { select: { usuarioId: true } }, categoria: { select: { nome: true } } },
  });
  const doUsuario = todos.filter((c) => c.usuarios.some((u) => u.usuarioId === params.usuarioId));
  const alvo =
    params.compromissoId === "diarios"
      ? doUsuario.filter((c) => c.frequencia === "DIARIA")
      : doUsuario.filter((c) => c.id === params.compromissoId);
  if (alvo.length === 0) return null;

  const categorias = [...new Set(alvo.map((c) => c.categoriaId).filter((id): id is string => !!id))];
  // Janela folgada: semana do dia (semanais) até o próximo dia útil (planejar).
  const inicio = inicioDoDiaBrasilia(somarDias(inicioDaSemana(params.dia), -1));
  const fim = inicioDoDiaBrasilia(somarDias(params.dia, 9));
  const tarefas = await prisma.tarefa.findMany({
    where: {
      responsavelId: params.usuarioId,
      categoriaId: { in: categorias },
      OR: [{ concluidaEm: { gte: inicio, lt: fim } }, { prazo: { gte: inicio, lt: fim } }],
    },
    select: { id: true, categoriaId: true, prazo: true, concluidaEm: true, prazoDefinidoEm: true },
  });
  const ctx: ContextoCalculo = { compromissos: todos.map(paraCalculo), tarefas, agora };

  const ids = new Set<string>();
  const partes: string[] = [];
  let valoresIniciais: FiltroTarefasCompromisso["valoresIniciais"];
  for (const c of alvo) {
    const calc = paraCalculo(c);
    for (const t of tarefasQueContam(calc, params.dia, tarefas)) ids.add(t.id);
    const r = c.frequencia === "DIARIA" ? avaliarDiario(calc, params.dia, ctx) : avaliarSemanal(calc, inicioDaSemana(params.dia), ctx);
    const placar = r ? ` (${r.realizado} de ${r.meta})` : "";
    const categoria = c.categoria?.nome ?? "da categoria";
    if (c.frequencia === "SEMANAL") {
      const segunda = inicioDaSemana(params.dia);
      partes.push(`${c.nome} na semana de ${ddmm(segunda)} a ${ddmm(somarDias(segunda, 6))}: concluídas na semana${placar}`);
      valoresIniciais = { categoriaId: c.categoriaId ?? undefined, responsavelId: params.usuarioId };
    } else if (c.regra === "PLANEJAR_DIA_SEGUINTE") {
      const versao = versaoVigente(calc.versoes, inicioDoDiaBrasilia(params.dia));
      const diaAlvo = versao ? proximoDiaUtil(params.dia, versao.diasUteis) : somarDias(params.dia, 1);
      partes.push(`Planejar ${ddmm(diaAlvo)}: tarefas ${categoria} com prazo em ${ddmm(diaAlvo)} agendadas até ${versao?.horarioCorte ?? "o corte"} de ${ddmm(params.dia)}${placar}`);
      valoresIniciais = { categoriaId: c.categoriaId ?? undefined, prazo: `${diaAlvo}T09:00`, responsavelId: params.usuarioId };
    } else {
      partes.push(`${c.nome} em ${ddmm(params.dia)}: concluídas no dia${placar}`);
      valoresIniciais = { categoriaId: c.categoriaId ?? undefined, responsavelId: params.usuarioId };
    }
  }

  return {
    descricao: alvo.length > 1 ? `Compromissos diários em ${ddmm(params.dia)} — ${partes.join(" · ")}` : partes[0],
    ids: [...ids],
    // Com vários compromissos juntos não dá pra saber em qual categoria criar.
    valoresIniciais: alvo.length === 1 ? valoresIniciais : undefined,
  };
}
