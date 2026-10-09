// Regras puras das despesas registradas antes do extrato (ver Despesa no
// schema). Sem acesso a banco — usadas pela tela, pelo servidor e pelos testes.

import { diaBrasilia } from "./brasilia";

export type OrigemDespesa = "AUDIO" | "COMPROVANTE" | "TEXTO" | "MANUAL" | "EXTRATO" | "PUSH";
export type StatusDespesa = "A_CONFIRMAR" | "AGUARDANDO_CONCILIACAO" | "CONCILIADA";
export type FiltroDespesas = "TODAS" | "AGUARDANDO" | "CONCILIADAS";

export const ROTULO_ORIGEM: Record<OrigemDespesa, string> = {
  AUDIO: "Áudio",
  COMPROVANTE: "Comprovante",
  TEXTO: "Texto",
  MANUAL: "Manual",
  EXTRATO: "Extrato",
  PUSH: "Push do banco",
};

/** Etiqueta da conta de origem do push (decisão do Marcos, 2026-10-08). */
export type ContaBancaria = "SICREDI" | "INFINITEPAY";
export const ROTULO_CONTA: Record<ContaBancaria, string> = { SICREDI: "Sicredi", INFINITEPAY: "InfinitePay" };

export const ROTULO_STATUS: Record<StatusDespesa, string> = {
  A_CONFIRMAR: "A confirmar",
  AGUARDANDO_CONCILIACAO: "Aguardando conciliação",
  CONCILIADA: "Conciliada",
};

/** "todas" mostra também os rascunhos do WhatsApp ainda não confirmados. */
export function statusDoFiltro(filtro: FiltroDespesas): StatusDespesa[] | null {
  if (filtro === "AGUARDANDO") return ["AGUARDANDO_CONCILIACAO"];
  if (filtro === "CONCILIADAS") return ["CONCILIADA"];
  return null;
}

export function filtroDaUrl(valor: string | undefined): FiltroDespesas {
  return valor === "AGUARDANDO" || valor === "CONCILIADAS" ? valor : "TODAS";
}

/**
 * Data guardada da despesa: meio-dia de Brasília do dia — a mesma hora que o
 * parser do OFX usa nas linhas do extrato, então o "dia" das duas coisas
 * sempre bate, seja lido em UTC ou em Brasília.
 */
export function dataDaDespesa(diaIso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(diaIso)) throw new Error("Data inválida — use o formato AAAA-MM-DD.");
  const data = new Date(`${diaIso}T12:00:00-03:00`);
  if (Number.isNaN(data.getTime()) || diaBrasilia(data) !== diaIso) throw new Error("Data inválida.");
  return data;
}

/** "1.234,56", "1234,56", "1234.56", "R$ 1.234,56" ou "96" -> centavos (NaN se inválido). */
export function textoParaCentavos(texto: string): number {
  let t = texto.replace(/R\$|\s/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const numero = Number(t);
  return t === "" || !Number.isFinite(numero) ? NaN : Math.round(numero * 100);
}

export function centavosParaTexto(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type CamposDespesa = {
  valorCentavos: number;
  fornecedor: string;
  categoriaId: string | null;
  centroGeralId: string | null;
  negocioId: string | null;
};

/**
 * O que falta pra despesa sair de rascunho (A_CONFIRMAR) e ficar aguardando
 * conciliação: valor, fornecedor, categoria e UM centro — geral ou projeto.
 */
export function pendenciasDaDespesa(d: CamposDespesa): string[] {
  const faltando: string[] = [];
  if (!Number.isInteger(d.valorCentavos) || d.valorCentavos <= 0) faltando.push("valor");
  if (!d.fornecedor.trim()) faltando.push("fornecedor");
  if (!d.categoriaId) faltando.push("categoria");
  if (!d.centroGeralId && !d.negocioId) faltando.push("centro de custo");
  return faltando;
}

export function validarCentro(d: Pick<CamposDespesa, "centroGeralId" | "negocioId">): void {
  if (d.centroGeralId && d.negocioId) throw new Error("Escolha um centro geral OU um projeto, não os dois.");
}

/** Valor do seletor de centro na tela: "g:<id>" (centro geral) ou "n:<id>" (projeto). */
export function centroDoSeletor(valor: string): { centroGeralId: string | null; negocioId: string | null } {
  if (valor.startsWith("g:")) return { centroGeralId: valor.slice(2) || null, negocioId: null };
  if (valor.startsWith("n:")) return { centroGeralId: null, negocioId: valor.slice(2) || null };
  return { centroGeralId: null, negocioId: null };
}

export function seletorDoCentro(d: Pick<CamposDespesa, "centroGeralId" | "negocioId">): string {
  if (d.centroGeralId) return `g:${d.centroGeralId}`;
  if (d.negocioId) return `n:${d.negocioId}`;
  return "";
}
