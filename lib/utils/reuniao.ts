// Regras puras do painel de reunião (semanal/mensal) — períodos, tipo do
// resumo e os "sinais de atenção" que o CRM levanta sozinho pra pauta.
// Pedido de 2026-09-25. Dados vêm de lib/server/reunioes.ts.

const DIA_MS = 24 * 60 * 60 * 1000;
const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export type TipoReuniao = "SEMANAL" | "MENSAL";

/** "AAAA-MM-DD" do dia em Brasília (o servidor da Vercel roda em UTC). */
export function diaBrasilia(data: Date): string {
  return data.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Meia-noite de Brasília (-03:00 fixo; o Brasil não tem mais horário de verão). */
export function inicioDoDiaBrasilia(diaIso: string): Date {
  return new Date(`${diaIso}T00:00:00-03:00`);
}

function inicioDoMesBrasilia(ano: number, mes: number): Date {
  // mes 1-12; aceita 0 e 13 (vira o ano vizinho)
  const d = new Date(Date.UTC(ano, mes - 1, 1));
  return inicioDoDiaBrasilia(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`);
}

export type PeriodosReuniao = {
  periodoInicio: Date;
  periodoFim: Date;
  proximoInicio: Date;
  proximoFim: Date;
};

/**
 * Semanal: analisa os 7 dias ANTES do dia da reunião e projeta os 7 dias a
 * partir dela (reunião de segunda = semana anterior de segunda a domingo +
 * a semana que começa). Mensal: até o dia 15 analisa o mês anterior (reunião
 * de fechamento no começo do mês); depois disso, o próprio mês. A
 * perspectiva é sempre o mês seguinte ao analisado.
 */
export function periodosDaReuniao(tipo: TipoReuniao, data: Date): PeriodosReuniao {
  const dia = diaBrasilia(data);
  if (tipo === "SEMANAL") {
    const inicioDoDia = inicioDoDiaBrasilia(dia);
    return {
      periodoInicio: new Date(inicioDoDia.getTime() - 7 * DIA_MS),
      periodoFim: inicioDoDia,
      proximoInicio: inicioDoDia,
      proximoFim: new Date(inicioDoDia.getTime() + 7 * DIA_MS),
    };
  }
  const [ano, mes, diaDoMes] = dia.split("-").map(Number);
  const mesAnalisado = diaDoMes <= 15 ? mes - 1 : mes;
  return {
    periodoInicio: inicioDoMesBrasilia(ano, mesAnalisado),
    periodoFim: inicioDoMesBrasilia(ano, mesAnalisado + 1),
    proximoInicio: inicioDoMesBrasilia(ano, mesAnalisado + 1),
    proximoFim: inicioDoMesBrasilia(ano, mesAnalisado + 2),
  };
}

/**
 * Campos "só data" (previsão de fechamento/produção, data de instalação) são
 * gravados como meia-noite UTC do dia escolhido (ver lib/utils/dates.ts) —
 * compara o DIA gravado com os dias de Brasília do intervalo [inicio, fim).
 */
export function dataCalendarioNoIntervalo(dataSoDia: Date, inicio: Date, fim: Date): boolean {
  const dia = dataSoDia.toISOString().slice(0, 10);
  return dia >= diaBrasilia(inicio) && dia < diaBrasilia(fim);
}

function ddmm(data: Date): string {
  const [, mes, dia] = diaBrasilia(data).split("-");
  return `${dia}/${mes}`;
}

/** "21/09 a 27/09" (fim exclusivo) ou "setembro de 2026" quando é um mês cheio. */
export function rotuloPeriodo(inicio: Date, fim: Date): string {
  const diaInicio = diaBrasilia(inicio);
  const ultimoDia = new Date(fim.getTime() - 1);
  const [ano, mes, dia] = diaInicio.split("-").map(Number);
  if (dia === 1 && inicioDoMesBrasilia(ano, mes + 1).getTime() === fim.getTime()) {
    return `${NOMES_MES[mes - 1]} de ${ano}`;
  }
  return `${ddmm(inicio)} a ${ddmm(ultimoDia)}`;
}

export function tituloPadraoReuniao(tipo: TipoReuniao, data: Date): string {
  if (tipo === "MENSAL") {
    const { periodoInicio, periodoFim } = periodosDaReuniao(tipo, data);
    return `Reunião mensal — ${rotuloPeriodo(periodoInicio, periodoFim)}`;
  }
  return `Reunião semanal — ${ddmm(data)}`;
}

// ---------------------------------------------------------------------------
// Resumo (serializável: vai pro client, pra IA e fica gravado no encerramento)
// ---------------------------------------------------------------------------

export type NegocioNoResumo = {
  id: string;
  titulo: string;
  contatoNome: string | null;
  valorCentavos: number;
  /** Etapa, motivo da perda, data prevista... depende da lista. */
  detalhe: string | null;
};

export type CompromissoNoResumo = {
  id: string;
  titulo: string;
  responsavelNome: string;
  prazo: string;
  status: "A_FAZER" | "EM_ANDAMENTO" | "APROVACAO" | "CONCLUIDA";
  atrasado: boolean;
  reuniaoId: string | null;
  reuniaoTitulo: string | null;
};

export type ResumoReuniao = {
  geradoEm: string;
  periodo: { inicio: string; fim: string; rotulo: string };
  proximo: { inicio: string; fim: string; rotulo: string };
  links: {
    funilVenda: string;
    funilPosVenda: string;
    parados: string;
    tarefasAtrasadas: string;
    aprovacoes: string;
    financeiro: string;
    conciliacao: string;
    producao: string;
    atendimento: string;
    dashboard: string;
  };
  vendas: {
    ganhos: { qtd: number; valorCentavos: number; itens: NegocioNoResumo[] };
    perdidos: { qtd: number; valorCentavos: number; itens: NegocioNoResumo[] };
    novosNegocios: { qtd: number; valorCentavos: number };
    leads: { conversasNovas: number; contatosNovos: number };
  };
  /** Foto do funil de venda no momento (não depende do período). */
  pipeline: {
    emNegociacao: { qtd: number; valorCentavos: number };
    emFechamento: { qtd: number; valorCentavos: number; itens: NegocioNoResumo[] };
    parados: { qtd: number; valorCentavos: number; itens: NegocioNoResumo[] };
    /** Abertos no funil de venda com a previsão de fechamento já no passado. */
    previsaoVencida: { qtd: number; valorCentavos: number; itens: NegocioNoResumo[] };
    etapas: { etapaId: string; nome: string; qtd: number; valorCentavos: number }[];
  };
  meta: {
    rotuloMes: string;
    alvoCentavos: number;
    ganhoCentavos: number;
    /** 0-100 */
    percentualAtingido: number;
    /** 0-100: quanto do mês já passou — pra comparar com o atingido. */
    percentualDoMes: number;
  } | null;
  financeiro: {
    entradasCentavos: number;
    saidasCentavos: number;
    resultadoCentavos: number;
    aClassificarQtd: number;
    aClassificarCentavos: number;
    ultimoLancamento: string | null;
  };
  posVenda: {
    etapas: { etapaId: string; nome: string; qtd: number; valorCentavos: number }[];
    emPagamento: { qtd: number; valorCentavos: number };
  };
  tarefas: {
    concluidasNoPeriodo: number;
    atrasadas: number;
    aprovacoesPendentes: number;
  };
  compromissos: {
    /** Compromissos de reuniões (qualquer uma) ainda não concluídos. */
    abertos: CompromissoNoResumo[];
    concluidosNoPeriodo: number;
  };
  perspectiva: {
    fechamentosPrevistos: { qtd: number; valorCentavos: number; itens: NegocioNoResumo[] };
    emFechamentoSemPrevisao: number;
    instalacoes: { qtd: number; itens: NegocioNoResumo[] };
    producaoPrevista: { qtd: number; itens: NegocioNoResumo[] };
    tarefasComPrazo: number;
    compromissosVencendo: number;
    metaProximoMesCentavos: number | null;
  };
};

// ---------------------------------------------------------------------------
// Sinais de atenção — o que o CRM aponta sozinho como assunto da reunião
// ---------------------------------------------------------------------------

export type NivelSinal = "alta" | "media" | "info";

export type SinalAtencao = {
  chave: string;
  nivel: NivelSinal;
  titulo: string;
  detalhe: string;
  href: string;
};

const PESO: Record<NivelSinal, number> = { alta: 0, media: 1, info: 2 };

function reais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function plural(qtd: number, singular: string, pluralTexto: string): string {
  return `${qtd} ${qtd === 1 ? singular : pluralTexto}`;
}

/** Ordenados do mais urgente pro informativo. `agora` só pra testes. */
export function sinaisDeAtencao(resumo: ResumoReuniao, agora: Date = new Date()): SinalAtencao[] {
  const sinais: SinalAtencao[] = [];
  const { links } = resumo;

  const compromissosAtrasados = resumo.compromissos.abertos.filter((c) => c.atrasado);
  if (compromissosAtrasados.length > 0) {
    sinais.push({
      chave: "compromissos_atrasados",
      nivel: "alta",
      titulo: `${plural(compromissosAtrasados.length, "compromisso atrasado", "compromissos atrasados")} de reuniões anteriores`,
      detalhe: compromissosAtrasados.slice(0, 3).map((c) => `${c.titulo} (${c.responsavelNome})`).join("; "),
      href: "#compromissos",
    });
  }

  if (resumo.financeiro.resultadoCentavos < 0) {
    sinais.push({
      chave: "resultado_negativo",
      nivel: "alta",
      titulo: `Resultado de caixa negativo no período: ${reais(resumo.financeiro.resultadoCentavos)}`,
      detalhe: `Entradas ${reais(resumo.financeiro.entradasCentavos)} × saídas ${reais(resumo.financeiro.saidasCentavos)}.`,
      href: links.financeiro,
    });
  }

  if (resumo.meta && resumo.meta.alvoCentavos > 0 && resumo.meta.percentualAtingido < resumo.meta.percentualDoMes - 10) {
    sinais.push({
      chave: "meta_abaixo_do_ritmo",
      nivel: "alta",
      titulo: `Meta de ${resumo.meta.rotuloMes} abaixo do ritmo: ${resumo.meta.percentualAtingido}% atingido com ${resumo.meta.percentualDoMes}% do mês`,
      detalhe: `${reais(resumo.meta.ganhoCentavos)} de ${reais(resumo.meta.alvoCentavos)}.`,
      href: links.dashboard,
    });
  }

  const parados = resumo.pipeline.parados;
  if (parados.qtd > 0) {
    sinais.push({
      chave: "negocios_parados",
      nivel: parados.qtd >= 3 || parados.valorCentavos >= 5_000_000 ? "alta" : "media",
      titulo: `${plural(parados.qtd, "negócio parado", "negócios parados")} além do prazo da etapa (${reais(parados.valorCentavos)})`,
      detalhe: parados.itens.slice(0, 3).map((n) => n.titulo).join("; "),
      href: links.parados,
    });
  }

  const vencida = resumo.pipeline.previsaoVencida;
  if (vencida.qtd > 0) {
    sinais.push({
      chave: "previsao_vencida",
      nivel: "media",
      titulo: `${plural(vencida.qtd, "negócio", "negócios")} com a previsão de fechamento vencida (${reais(vencida.valorCentavos)})`,
      detalhe: vencida.itens.slice(0, 3).map((n) => `${n.titulo} (${n.detalhe})`).join("; "),
      href: links.funilVenda,
    });
  }

  if (resumo.perspectiva.emFechamentoSemPrevisao > 0) {
    sinais.push({
      chave: "fechamento_sem_previsao",
      nivel: "media",
      titulo: `${plural(resumo.perspectiva.emFechamentoSemPrevisao, "negócio", "negócios")} em Fechamento sem data prevista de fechamento`,
      detalhe: "Sem previsão não entram na perspectiva de receita — definir data e próximo passo.",
      href: links.funilVenda,
    });
  }

  const { perdidos, ganhos } = resumo.vendas;
  if (perdidos.qtd > 0 && perdidos.qtd > ganhos.qtd) {
    sinais.push({
      chave: "mais_perdas_que_ganhos",
      nivel: "media",
      titulo: `Mais negócios perdidos (${perdidos.qtd}) que ganhos (${ganhos.qtd}) no período`,
      detalhe: perdidos.itens.slice(0, 3).map((n) => `${n.titulo}: ${n.detalhe ?? "sem motivo"}`).join("; "),
      href: links.funilVenda,
    });
  }

  if (resumo.vendas.leads.conversasNovas === 0 && resumo.vendas.leads.contatosNovos === 0) {
    sinais.push({
      chave: "sem_leads",
      nivel: "media",
      titulo: "Nenhum lead novo no período",
      detalhe: "Nenhuma conversa nova iniciada por cliente nem contato cadastrado — revisar a prospecção.",
      href: links.atendimento,
    });
  }

  if (resumo.financeiro.aClassificarQtd > 0) {
    sinais.push({
      chave: "extrato_a_classificar",
      nivel: "media",
      titulo: `${plural(resumo.financeiro.aClassificarQtd, "lançamento", "lançamentos")} do extrato sem projeto ou centro de custo`,
      detalhe: `${reais(resumo.financeiro.aClassificarCentavos)} fora do resultado por projeto/centro até classificar.`,
      href: links.conciliacao,
    });
  }

  const ultimo = resumo.financeiro.ultimoLancamento ? new Date(resumo.financeiro.ultimoLancamento) : null;
  if (!ultimo || agora.getTime() - ultimo.getTime() > 7 * DIA_MS) {
    sinais.push({
      chave: "extrato_desatualizado",
      nivel: "media",
      titulo: ultimo ? `Extrato bancário sem lançamentos desde ${ddmm(ultimo)}` : "Nenhum extrato bancário importado",
      detalhe: "Importar o OFX mais recente pra os números de caixa valerem.",
      href: links.conciliacao,
    });
  }

  if (resumo.tarefas.atrasadas > 0) {
    sinais.push({
      chave: "tarefas_atrasadas",
      nivel: resumo.tarefas.atrasadas >= 5 ? "alta" : "media",
      titulo: `${plural(resumo.tarefas.atrasadas, "tarefa atrasada", "tarefas atrasadas")}`,
      detalhe: "Repriorizar, redistribuir ou renegociar prazo.",
      href: links.tarefasAtrasadas,
    });
  }

  if (resumo.tarefas.aprovacoesPendentes > 0) {
    sinais.push({
      chave: "aprovacoes_pendentes",
      nivel: "media",
      titulo: `${plural(resumo.tarefas.aprovacoesPendentes, "tarefa aguardando", "tarefas aguardando")} aprovação`,
      detalhe: "Aprovar ou devolver durante a reunião.",
      href: links.aprovacoes,
    });
  }

  if (resumo.perspectiva.instalacoes.qtd > 0) {
    sinais.push({
      chave: "instalacoes_previstas",
      nivel: "info",
      titulo: `${plural(resumo.perspectiva.instalacoes.qtd, "instalação prevista", "instalações previstas")} no próximo período`,
      detalhe: "Confirmar equipe, material e logística.",
      href: links.producao,
    });
  }

  return sinais.sort((a, b) => PESO[a.nivel] - PESO[b.nivel]);
}
