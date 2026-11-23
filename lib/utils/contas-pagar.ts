// Regras puras das contas a pagar (ver ContaPagar no schema). Sem acesso a
// banco — usadas pela tela, pelo servidor, pela planilha/PDF e pelos testes.
// Dias como texto "AAAA-MM-DD", em Brasília (lib/utils/brasilia.ts). Pedido
// de 2026-11-23.

import { somarDias } from "./brasilia";

export type StatusContaPagar = "A_CONFIRMAR" | "ABERTA" | "PAGA" | "CANCELADA";
export type OrigemContaPagar = "MANUAL" | "ARQUIVO" | "TEXTO" | "AUDIO" | "FIXA";
export type RepeticaoConta = "UNICA" | "MENSAL" | "PARCELADA";
export type SituacaoFiltro = "ABERTAS" | "PAGAS" | "TODAS";

/** Conta como a tela, a planilha e o PDF recebem (datas "AAAA-MM-DD"). */
export type ContaPagarVM = {
  id: string;
  vencimento: string;
  valorCentavos: number;
  fornecedor: string;
  descricao: string | null;
  categoriaId: string | null;
  categoriaNome: string | null;
  centroGeralId: string | null;
  centroGeralNome: string | null;
  negocioId: string | null;
  negocioTitulo: string | null;
  contatoNome: string | null;
  status: StatusContaPagar;
  origem: OrigemContaPagar;
  codigoPagamento: string | null;
  parcela: number | null;
  totalParcelas: number | null;
  repeteTodoMes: boolean;
  temAnexo: boolean;
  anexoMime: string | null;
  pagaEm: string | null;
  despesaId: string | null;
  despesaConciliada: boolean;
  registradaPorNome: string;
};

/** Rascunho do agente que ninguém confirmou (a aba mostra para lançar, editar ou descartar). */
export type RascunhoContaVM = ContaPagarVM & { vencimentoInformado: boolean; faltando: string[] };

/** Projeto (negócio) ou centro geral da conta. */
export function centroDaConta(c: Pick<ContaPagarVM, "negocioTitulo" | "centroGeralNome">): string {
  return c.negocioTitulo ?? c.centroGeralNome ?? "Sem centro";
}

export const MAX_PARCELAS = 48;
/** A Vercel recusa envio acima de ~4,5 MB; a foto é reduzida no aparelho antes. */
export const TAMANHO_MAXIMO_ANEXO_CONTA = 4 * 1024 * 1024;
/** "Marcar como paga" sugere despesa já registrada de mesmo valor até 5 dias antes ou depois. */
export const DIAS_PARA_LIGAR_DESPESA = 5;

export const ROTULO_STATUS_CONTA: Record<StatusContaPagar, string> = {
  A_CONFIRMAR: "A confirmar",
  ABERTA: "Em aberto",
  PAGA: "Paga",
  CANCELADA: "Cancelada",
};

export const ROTULO_ORIGEM_CONTA: Record<OrigemContaPagar, string> = {
  MANUAL: "Manual",
  ARQUIVO: "Boleto/fatura",
  TEXTO: "Texto",
  AUDIO: "Áudio",
  FIXA: "Conta fixa",
};

function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Dia `dia` do mês (1–12), ou o último dia se o mês for mais curto (31 → 30, 28 ou 29). */
export function diaDoMes(ano: number, mes: number, dia: number): string {
  const d = Math.min(dia, diasNoMes(ano, mes));
  return `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** `meses` meses depois, no dia `dia` (ou no mesmo dia de `diaIso`). */
export function somarMeses(diaIso: string, meses: number, dia?: number): string {
  const [ano, mes, d] = diaIso.split("-").map(Number);
  const total = ano * 12 + (mes - 1) + meses;
  return diaDoMes(Math.floor(total / 12), (total % 12) + 1, dia ?? d);
}

export function fimDoMes(diaIso: string): string {
  const [ano, mes] = diaIso.split("-").map(Number);
  return diaDoMes(ano, mes, 31);
}

/** Até onde as contas fixas já existem: o fim do mês que vem. */
export function horizonteDasFixas(hoje: string): string {
  return fimDoMes(somarMeses(`${hoje.slice(0, 7)}-01`, 1));
}

/** Meses seguintes de uma conta fixa depois de `ultimo`, até o horizonte (no máximo 24 de uma vez). */
export function proximosVencimentosFixos(ultimo: string, dia: number, horizonte: string): string[] {
  const vencimentos: string[] = [];
  let v = somarMeses(ultimo, 1, dia);
  while (v <= horizonte && vencimentos.length < 24) {
    vencimentos.push(v);
    v = somarMeses(v, 1, dia);
  }
  return vencimentos;
}

/** Uma parcela por mês, no mesmo dia da primeira. */
export function vencimentosDasParcelas(primeiro: string, quantidade: number): string[] {
  const dia = Number(primeiro.slice(8));
  return Array.from({ length: quantidade }, (_, i) => somarMeses(primeiro, i, dia));
}

export function rotuloParcela(parcela: number | null, totalParcelas: number | null): string | null {
  return parcela && totalParcelas ? `${parcela}/${totalParcelas}` : null;
}

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
}

/** "vence hoje", "vence amanhã", "vence em 5 dias", "venceu ontem", "venceu há 3 dias". */
export function prazoLegivel(vencimento: string, hoje: string): string {
  const dias = diasEntre(hoje, vencimento);
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  if (dias > 1) return `vence em ${dias} dias`;
  if (dias === -1) return "venceu ontem";
  return `venceu há ${-dias} dias`;
}

export type GrupoConta = "ATRASADAS" | "HOJE" | "SETE_DIAS" | "MES" | "DEPOIS" | "PAGAS";

export const ROTULO_GRUPO: Record<GrupoConta, string> = {
  ATRASADAS: "Atrasadas",
  HOJE: "Vence hoje",
  SETE_DIAS: "Próximos 7 dias",
  MES: "Resto do mês",
  DEPOIS: "Depois",
  PAGAS: "Pagas",
};

const ORDEM_GRUPOS: GrupoConta[] = ["ATRASADAS", "HOJE", "SETE_DIAS", "MES", "DEPOIS", "PAGAS"];

export function grupoDaConta(c: { status: StatusContaPagar; vencimento: string }, hoje: string): GrupoConta {
  if (c.status === "PAGA") return "PAGAS";
  if (c.vencimento < hoje) return "ATRASADAS";
  if (c.vencimento === hoje) return "HOJE";
  if (c.vencimento <= somarDias(hoje, 7)) return "SETE_DIAS";
  if (c.vencimento <= fimDoMes(hoje)) return "MES";
  return "DEPOIS";
}

type ContaAgrupavel = { status: StatusContaPagar; vencimento: string; valorCentavos: number };

/** Grupos não vazios, na ordem do relatório. Pagas: a mais recente primeiro; o resto: a que vence antes primeiro. */
export function agruparContas<T extends ContaAgrupavel>(contas: T[], hoje: string) {
  return ORDEM_GRUPOS.map((grupo) => {
    const doGrupo = contas
      .filter((c) => grupoDaConta(c, hoje) === grupo)
      .sort((a, b) => (grupo === "PAGAS" ? b.vencimento.localeCompare(a.vencimento) : a.vencimento.localeCompare(b.vencimento)));
    return { grupo, contas: doGrupo, totalCentavos: doGrupo.reduce((soma, c) => soma + c.valorCentavos, 0) };
  }).filter((g) => g.contas.length > 0);
}

/** Total por categoria, centro etc. — o maior primeiro. */
export function totaisPor<T extends { valorCentavos: number }>(contas: T[], nome: (c: T) => string) {
  const mapa = new Map<string, { nome: string; quantidade: number; totalCentavos: number }>();
  for (const c of contas) {
    const n = nome(c);
    const atual = mapa.get(n) ?? { nome: n, quantidade: 0, totalCentavos: 0 };
    atual.quantidade += 1;
    atual.totalCentavos += c.valorCentavos;
    mapa.set(n, atual);
  }
  return [...mapa.values()].sort((a, b) => b.totalCentavos - a.totalCentavos || a.nome.localeCompare(b.nome));
}

export const ROTULO_SITUACAO: Record<SituacaoFiltro, string> = {
  ABERTAS: "Em aberto",
  PAGAS: "Pagas",
  TODAS: "Em aberto e pagas",
};

export type FiltroContas = {
  situacao: SituacaoFiltro;
  /** Vencimento de/até ("AAAA-MM-DD"). */
  de: string | null;
  ate: string | null;
  categoriaId: string | null;
  /** "g:<id>" (centro geral) ou "n:<id>" (projeto) — o mesmo valor do seletor de centro. */
  centro: string | null;
  fornecedor: string | null;
};

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Filtro a partir da URL (aba da tela, planilha e PDF usam os mesmos nomes). */
export function filtroContasDaUrl(p: Record<string, string | null | undefined>): FiltroContas {
  const situacao = p.situacao === "PAGAS" || p.situacao === "TODAS" ? p.situacao : "ABERTAS";
  const dia = (v: string | null | undefined) => (v && DIA.test(v) ? v : null);
  const texto = (v: string | null | undefined) => v?.trim() || null;
  return {
    situacao,
    de: dia(p.de),
    ate: dia(p.ate),
    categoriaId: texto(p.categoria),
    centro: p.centro && /^[gn]:.+/.test(p.centro) ? p.centro : null,
    fornecedor: texto(p.fornecedor)?.slice(0, 100) ?? null,
  };
}

/** O contrário de filtroContasDaUrl (só o que difere do padrão). */
export function parametrosDoFiltro(f: FiltroContas): URLSearchParams {
  const p = new URLSearchParams();
  if (f.situacao !== "ABERTAS") p.set("situacao", f.situacao);
  if (f.de) p.set("de", f.de);
  if (f.ate) p.set("ate", f.ate);
  if (f.categoriaId) p.set("categoria", f.categoriaId);
  if (f.centro) p.set("centro", f.centro);
  if (f.fornecedor) p.set("fornecedor", f.fornecedor);
  return p;
}

export function filtroVazio(f: FiltroContas): boolean {
  return parametrosDoFiltro({ ...f, situacao: "ABERTAS" }).size === 0;
}

/** "AAAA-MM-DD" -> "dd/mm/aaaa". */
export function dataBR(diaIso: string): string {
  return diaIso.split("-").reverse().join("/");
}

/** Foto ou PDF do boleto/fatura — o resto é recusado. Devolve o tipo a guardar. */
export function mimeAnexoConta(mime: string, nome: string): string | null {
  const m = mime.toLowerCase();
  if (m === "application/pdf" || /\.pdf$/i.test(nome)) return "application/pdf";
  if (/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(m)) return m;
  if (/\.(jpe?g)$/i.test(nome)) return "image/jpeg";
  if (/\.png$/i.test(nome)) return "image/png";
  if (/\.(heic|heif)$/i.test(nome)) return "image/heic";
  return null;
}

export type LinhaPlanilhaConta = {
  vencimento: string;
  fornecedor: string;
  descricao: string | null;
  parcela: string | null;
  categoria: string | null;
  centro: string | null;
  valorCentavos: number;
  situacao: string;
  pagaEm: string | null;
  codigoPagamento: string | null;
};

/** Texto que o Excel leria como fórmula (=, +, -, @) ganha um apóstrofo na frente. */
function campoCsv(valor: string | null): string {
  let v = valor ?? "";
  if (/^[=+\-@]/.test(v)) v = `'${v}`;
  return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Planilha que o Excel em português abre direto: ";" entre colunas, vírgula
 * nos centavos, UTF-8 com BOM (senão os acentos saem errados).
 */
export function planilhaContas(linhas: LinhaPlanilhaConta[]): string {
  const cabecalho = ["Vencimento", "Fornecedor", "Descrição", "Parcela", "Categoria", "Centro/projeto", "Valor (R$)", "Situação", "Paga em", "Código para pagar"];
  const corpo = linhas.map((l) =>
    [
      dataBR(l.vencimento),
      campoCsv(l.fornecedor),
      campoCsv(l.descricao),
      l.parcela ?? "",
      campoCsv(l.categoria),
      campoCsv(l.centro),
      (l.valorCentavos / 100).toFixed(2).replace(".", ","),
      l.situacao,
      l.pagaEm ? dataBR(l.pagaEm) : "",
      campoCsv(l.codigoPagamento),
    ].join(";"),
  );
  return `﻿${[cabecalho.join(";"), ...corpo].join("\r\n")}\r\n`;
}

/** Situação mostrada na planilha/PDF: em aberto e vencida = "Atrasada". */
export function situacaoLegivel(c: { status: StatusContaPagar; vencimento: string }, hoje: string): string {
  if (c.status === "ABERTA" && c.vencimento < hoje) return "Atrasada";
  return ROTULO_STATUS_CONTA[c.status];
}
