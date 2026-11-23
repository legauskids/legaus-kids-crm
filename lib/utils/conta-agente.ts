// Contas a pagar pelo WhatsApp e pelo Telegram (pedido de 2026-11-23, etapa
// 2), puras e testáveis. O modelo só extrai o que entendeu do boleto,
// fatura, texto ou áudio; a conta nasce sempre como rascunho e pede
// confirmação (enquete no WhatsApp, botões no Telegram), como a despesa.
// Categoria e centro saem pelas mesmas regras da despesa
// (montarDespesaDaMensagem).

import { diaDaSemana, somarDias } from "./brasilia";
import { emLinhas, type Botao, type Botoes, type CanalAgente } from "./agente-canal";
import { pendenciasDaDespesa } from "./despesas";
import { MAX_PARCELAS, dataBR, diaDoMes, prazoLegivel, vencimentosDasParcelas } from "./contas-pagar";
import {
  OPCAO_CONFIRMAR,
  OPCAO_DESCARTAR,
  OPCAO_NEGOCIO,
  montarDespesaDaMensagem,
  normalizar,
  type CategoriaAgente,
  type CentroGeralAgente,
  type Enquete,
  type NegocioAgente,
} from "./despesa-agente";

export type ExtracaoConta = {
  /** Em reais (de cada parcela, se parcelada). */
  valor?: number | null;
  fornecedor?: string | null;
  /** Como está no documento (dd/mm/aaaa) ou como foi falado ("dia 10", "sexta"). */
  vencimentoTexto?: string | null;
  categoria?: string | null;
  centro?: string | null;
  descricao?: string | null;
  /** Linha digitável, código de barras ou Pix copia e cola. */
  codigoPagamento?: string | null;
  parcelas?: number | null;
  repeteTodoMes?: boolean | null;
};

const DIAS_SEMANA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function diaValido(ano: number, mes: number, dia: number): string | null {
  const iso = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

function distancia(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`));
}

/** Dia/mês sem ano: deste ano ou do próximo, o mais perto de hoje (boleto vencido há pouco continua deste ano). */
function maisPerto(mes: number, dia: number, hoje: string, ano?: number): string | null {
  if (ano) return diaValido(ano, mes, dia);
  const anoHoje = Number(hoje.slice(0, 4));
  const opcoes = [diaValido(anoHoje, mes, dia), diaValido(anoHoje + 1, mes, dia)].filter((d): d is string => d !== null);
  return opcoes.sort((a, b) => distancia(a, hoje) - distancia(b, hoje))[0] ?? null;
}

/**
 * Vencimento falado ou impresso -> AAAA-MM-DD, olhando para a frente (ao
 * contrário da data da despesa, que é sempre passada): "hoje", "amanhã",
 * "sexta" (a próxima, hoje inclusive), "dia 10" (este mês se ainda não
 * passou, senão o próximo), "10/12", "10/12/2026", "10 de dezembro",
 * "2026-12-10". null se não entender.
 */
export function resolverVencimentoFalado(texto: string | null | undefined, hoje: string): string | null {
  if (!texto?.trim()) return null;
  const iso = texto.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return diaValido(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const t = normalizar(texto);
  if (/\bdepois de amanha\b/.test(t)) return somarDias(hoje, 2);
  if (/\bamanha\b/.test(t)) return somarDias(hoje, 1);
  if (/\bhoje\b/.test(t)) return hoje;

  const barra = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (barra) {
    const ano = barra[3] ? Number(barra[3].length === 2 ? `20${barra[3]}` : barra[3]) : undefined;
    return maisPerto(Number(barra[2]), Number(barra[1]), hoje, ano);
  }

  const porExtenso = t.match(/\b(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?/);
  if (porExtenso) {
    const mes = MESES.findIndex((m) => m.startsWith(porExtenso[2].slice(0, 3)));
    if (mes >= 0) return maisPerto(mes + 1, Number(porExtenso[1]), hoje, porExtenso[3] ? Number(porExtenso[3]) : undefined);
  }

  const soDia = t.match(/\bdia\s+(\d{1,2})\b/);
  if (soDia) {
    const dia = Number(soDia[1]);
    const [ano, mes] = hoje.split("-").map(Number);
    const desteMes = diaValido(ano, mes, dia);
    if (desteMes && desteMes >= hoje) return desteMes;
    // Mês seguinte: "dia 31" vira o último dia num mês curto.
    const proximoMes = somarDias(`${hoje.slice(0, 8)}28`, 7);
    return dia >= 1 && dia <= 31 ? diaDoMes(Number(proximoMes.slice(0, 4)), Number(proximoMes.slice(5, 7)), dia) : null;
  }

  const semana = DIAS_SEMANA.findIndex((d) => new RegExp(`\\b${d}`).test(t));
  if (semana >= 0) {
    const frente = (semana - diaDaSemana(hoje) + 7) % 7;
    return somarDias(hoje, /\b(que vem|proxim)/.test(t) && frente === 0 ? 7 : frente);
  }
  return null;
}

export type ContaMontada = {
  dados: {
    /** null = não deu para saber (pede na confirmação). */
    vencimento: string | null;
    valorCentavos: number;
    fornecedor: string;
    descricao: string | null;
    categoriaId: string | null;
    centroGeralId: string | null;
    negocioId: string | null;
    codigoPagamento: string | null;
    totalParcelas: number | null;
    repeteTodoMes: boolean;
  };
  nomes: { categoria: string | null; centro: string | null; centroEhProjeto: boolean };
  categoriaDeclarada: boolean;
  centroDeclarado: boolean;
};

/** Parcelas que valem: 2 a 48; o resto = conta só. */
export function parcelasValidas(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isInteger(n) && n >= 2 && n <= MAX_PARCELAS ? n : null;
}

/** Junta a extração do modelo com a mensagem e os cadastros. */
export function montarContaDaMensagem(input: {
  texto: string;
  hoje: string;
  extracao: ExtracaoConta;
  categorias: CategoriaAgente[];
  centrosGerais: CentroGeralAgente[];
  negocios: NegocioAgente[];
}): ContaMontada {
  const { extracao: e } = input;
  // O modelo às vezes preenche o que não sabe com "<UNKNOWN>" ou "?".
  const fornecedor = /^\s*(<?unknown>?|\?+|desconhecid[oa]|n\/?a)\s*$/i.test(e.fornecedor ?? "") ? null : e.fornecedor;
  const base = montarDespesaDaMensagem({
    texto: input.texto,
    origem: "TEXTO",
    hoje: input.hoje,
    extracao: { valor: e.valor, fornecedor, categoria: e.categoria, centro: e.centro, descricao: e.descricao },
    categorias: input.categorias,
    centrosGerais: input.centrosGerais,
    negocios: input.negocios,
  });
  const totalParcelas = parcelasValidas(e.parcelas);
  const { dia, ...semDia } = base.dados;
  void dia;
  return {
    dados: {
      ...semDia,
      vencimento: resolverVencimentoFalado(e.vencimentoTexto, input.hoje),
      codigoPagamento: e.codigoPagamento?.trim() || null,
      totalParcelas,
      repeteTodoMes: Boolean(e.repeteTodoMes) && !totalParcelas,
    },
    nomes: base.nomes,
    categoriaDeclarada: base.categoriaDeclarada,
    centroDeclarado: base.centroDeclarado,
  };
}

/** O que falta para a conta sair do rascunho: o da despesa + o vencimento. */
export function pendenciasDaConta(d: {
  valorCentavos: number;
  fornecedor: string;
  categoriaId: string | null;
  centroGeralId: string | null;
  negocioId: string | null;
  vencimentoInformado: boolean;
}): string[] {
  return [...pendenciasDaDespesa(d), ...(d.vencimentoInformado ? [] : ["vencimento"])];
}

function reais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");
}

/** Código longo aparece cortado no resumo (o inteiro fica guardado e aparece na tela). */
export function codigoCurto(codigo: string): string {
  return codigo.length > 28 ? `${codigo.slice(0, 24)}…` : codigo;
}

export type ResumoConta = {
  dados: {
    vencimento: string | null;
    valorCentavos: number;
    fornecedor: string;
    codigoPagamento: string | null;
    totalParcelas: number | null;
    repeteTodoMes: boolean;
  };
  nomes: { categoria: string | null; centro: string | null; centroEhProjeto: boolean };
  faltando: string[];
  categoriaDeduzida?: boolean;
  centroDeduzido?: boolean;
  temArquivo?: boolean;
};

function linhasDaConta(d: ResumoConta["dados"], hoje: string): string[] {
  const linhas = [`📄 *${d.valorCentavos > 0 ? reais(d.valorCentavos) : "valor?"}*${d.totalParcelas ? " por parcela" : ""} — ${d.fornecedor || "fornecedor?"}`];
  linhas.push(d.vencimento ? `📅 Vence ${dataBR(d.vencimento)} (${prazoLegivel(d.vencimento, hoje)})` : "📅 Vencimento: ?");
  if (d.totalParcelas && d.vencimento) {
    const ultima = vencimentosDasParcelas(d.vencimento, d.totalParcelas).at(-1)!;
    linhas.push(`🔢 ${d.totalParcelas} parcelas, a última em ${dataBR(ultima)}${d.valorCentavos > 0 ? ` — total ${reais(d.valorCentavos * d.totalParcelas)}` : ""}`);
  }
  if (d.repeteTodoMes) linhas.push("🔁 Repete todo mês (conta fixa)");
  return linhas;
}

/** Resumo do rascunho pedindo confirmação. */
export function mensagemDaConta(r: ResumoConta, hoje: string, intro = "Entendi esta conta a pagar, confere?", canal: CanalAgente = "whatsapp"): string {
  const linhas = [
    intro,
    ...linhasDaConta(r.dados, hoje),
    `🏷️ Categoria: ${r.nomes.categoria ?? "?"}${r.nomes.categoria && r.categoriaDeduzida ? " _(deduzida)_" : ""}`,
    `🎯 Centro: ${r.nomes.centro ?? "?"}${r.nomes.centroEhProjeto ? " (obra)" : ""}${r.nomes.centro && r.centroDeduzido ? " _(deduzido)_" : ""}`,
  ];
  if (r.dados.codigoPagamento) linhas.push(`🔑 Código para pagar: ${codigoCurto(r.dados.codigoPagamento)}`);
  if (r.temArquivo) linhas.push("📎 O arquivo fica guardado na conta.");
  if (r.faltando.length) linhas.push(`Não consegui identificar: ${r.faltando.join(", ")}.${r.faltando.includes("vencimento") ? ' Me diga o vencimento (ex.: "vence dia 10").' : ""}`);
  if (!r.nomes.centroEhProjeto) linhas.push("", "🏗️ É de algum negócio/obra? Me diga o nome que eu vinculo.");
  linhas.push(
    "",
    canal === "whatsapp"
      ? "Confirme na enquete abaixo ou responda *sim* (texto ou áudio). Se algo estiver errado, me diga o que corrigir."
      : canal === "telegram"
        ? "Toque num botão abaixo ou responda *sim* (texto ou áudio). Se algo estiver errado, me diga o que corrigir."
        : "Responda *sim* para lançar ou me diga o que corrigir.",
  );
  return linhas.join("\n");
}

export function mensagemContaLancada(d: ResumoConta["dados"], hoje: string): string {
  return ["✅ Conta lançada:", ...linhasDaConta(d, hoje), "Está em Financeiro → Contas a pagar."].join("\n");
}

/** Enquete do WhatsApp que acompanha o resumo (o voto volta por /api/agente/enquete com o ref). */
export function enqueteDaConta(c: { id: string; valorCentavos: number; fornecedor: string; ehProjeto: boolean }): Enquete {
  const valor = c.valorCentavos > 0 ? reais(c.valorCentavos) : "valor a definir";
  return {
    pergunta: `Lançar a conta a pagar de ${valor}${c.fornecedor ? ` — ${c.fornecedor}` : ""}?`.slice(0, 250),
    opcoes: c.ehProjeto ? [OPCAO_CONFIRMAR, OPCAO_DESCARTAR] : [OPCAO_CONFIRMAR, OPCAO_NEGOCIO, OPCAO_DESCARTAR],
    ref: `conta:${c.id}`,
  };
}

/** Botões do resumo no Telegram — os mesmos da despesa, com o prefixo da conta (ver lerBotao). */
export function botoesDaConta(c: {
  id: string;
  ehProjeto: boolean;
  categoria: string | null;
  categoriaDeduzida: boolean;
  centro: string | null;
  centroDeduzido: boolean;
}): Botoes {
  const linhas: Botoes = [
    [
      { texto: "✅ Confirmar", dados: `cp:ok:${c.id}` },
      { texto: "✏️ Corrigir", dados: `cp:co:${c.id}` },
      { texto: "❌ Descartar", dados: `cp:x:${c.id}` },
    ],
  ];
  if (!c.categoria || c.categoriaDeduzida) {
    linhas.push([{ texto: c.categoria ? `🏷️ ${c.categoria} · trocar` : "🏷️ Escolher categoria", dados: `cp:vc:${c.id}` }]);
  }
  const centro: Botao[] = [];
  if (!c.ehProjeto && (!c.centro || c.centroDeduzido)) centro.push({ texto: c.centro ? `🎯 ${c.centro} · trocar` : "🎯 Escolher centro", dados: `cp:vg:${c.id}` });
  if (!c.ehProjeto) centro.push({ texto: OPCAO_NEGOCIO, dados: `cp:ng:${c.id}` });
  if (centro.length) linhas.push(centro);
  return linhas;
}

export function botoesDeCategoriasConta(contaId: string, categorias: { id: string; nome: string }[], atualId: string | null): Botoes {
  const lista = categorias.map((c) => ({ texto: `${c.id === atualId ? "• " : ""}${c.nome}`, dados: `cpc:${contaId}:${c.id.slice(0, 8)}` }));
  return [...emLinhas(lista, 2), [{ texto: "↩️ Voltar", dados: `cp:re:${contaId}` }]];
}

export function botoesDeCentrosConta(contaId: string, centros: { id: string; nome: string }[], atualId: string | null): Botoes {
  const lista = centros.map((g) => ({ texto: `${g.id === atualId ? "• " : ""}${g.nome}`, dados: `cpg:${contaId}:${g.id}` }));
  return [...emLinhas(lista, 2), [{ texto: OPCAO_NEGOCIO, dados: `cp:ng:${contaId}` }, { texto: "↩️ Voltar", dados: `cp:re:${contaId}` }]];
}

// "Paguei" e push do banco com o valor de uma conta aberta (vencimento até 5
// dias antes ou depois): pergunta se é o pagamento dela — nunca liga sozinho.

export const OPCAO_E_A_CONTA = "✅ Sim, é essa conta";
export const OPCAO_NAO_E_A_CONTA = "➖ Não";

export type ContaParaPagamento = { id: string; fornecedor: string; valorCentavos: number; vencimento: string; parcela: number | null; totalParcelas: number | null };

function nomeDaConta(c: ContaParaPagamento): string {
  return `${c.fornecedor}${c.parcela && c.totalParcelas ? ` (parcela ${c.parcela}/${c.totalParcelas})` : ""}`;
}

export function perguntaDePagamento(c: ContaParaPagamento): string {
  return `🧾 Esse valor é o de uma conta a pagar em aberto: *${nomeDaConta(c)}* — ${reais(c.valorCentavos)}, vence ${dataBR(c.vencimento)}. É o pagamento dela?`;
}

export function enqueteDePagamento(c: ContaParaPagamento, despesaId: string): Enquete {
  return {
    pergunta: `É o pagamento da conta ${nomeDaConta(c)} (vence ${dataBR(c.vencimento).slice(0, 5)})?`.slice(0, 250),
    opcoes: [OPCAO_E_A_CONTA, OPCAO_NAO_E_A_CONTA],
    ref: `pagamento:${c.id}:${despesaId}`,
  };
}

export function botoesDePagamento(contaId: string, despesaId: string): Botoes {
  return [
    [
      { texto: "✅ É essa conta", dados: `pg:${contaId}:${despesaId}` },
      { texto: "➖ Não é", dados: `pn:${despesaId}` },
    ],
  ];
}

/**
 * A resposta do modelo tem cara de resumo de conta a pagar (escrito sem a
 * ferramenta = nada gravado). Estrito de propósito: a resposta de uma
 * consulta (listar_contas_pagar) fala de contas e não pode disparar isso.
 */
export function pareceRespostaDeConta(texto: string): boolean {
  return /conta a pagar, confere|conta lançada|lancei a conta|lançar a conta a pagar de/i.test(texto);
}
