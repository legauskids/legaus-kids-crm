// Prováveis pares entre linhas do extrato e despesas já registradas — regra
// pura, sem banco. NUNCA concilia: só lista candidatos pra tela, e quem
// confirma o par é o usuário (pedido de 2026-10-07).
//
// Critério: SAÍDA do extrato x despesa aguardando conciliação com o MESMO
// valor exato e data a até 3 dias. Ordem: fornecedor parecido com a
// descrição do extrato vale 2 pontos por palavra, e cada dia de diferença
// tira 1. Candidato descartado com "Não é esse" não volta pra aquela linha.

import { somarDias } from "./brasilia";

export const JANELA_DIAS_PAR = 3;

export type LinhaExtratoPar = { id: string; dia: string; descricao: string; valorCentavos: number; tipo: "ENTRADA" | "SAIDA" };
export type DespesaPar = { id: string; dia: string; valorCentavos: number; fornecedor: string };
export type CandidatoPar<D extends DespesaPar = DespesaPar> = { despesa: D; dias: number; palavrasEmComum: number; pontos: number };

const REGEX_DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");

/** Palavras que aparecem em nome de empresa sem identificar o fornecedor. */
const PALAVRAS_GENERICAS = new Set(["LTDA", "EIRELI", "COMERCIO", "COMERCIAL", "INDUSTRIA", "SERVICOS", "EMPRESA", "BRASIL"]);

function palavras(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(REGEX_DIACRITICOS, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

/** Dias de calendário entre dois dias "AAAA-MM-DD" (sempre positivo). */
export function diferencaDias(a: string, b: string): number {
  const ms = Math.abs(new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime());
  return Math.round(ms / 86_400_000);
}

/**
 * Quantas palavras do fornecedor (4+ letras, não genéricas) aparecem na
 * descrição do extrato. O Sicredi corta a descrição ("MATERIAIS DE CONSTR"),
 * então palavra cortada no fim também conta se tiver 4+ letras.
 */
export function palavrasEmComum(fornecedor: string, descricaoExtrato: string): number {
  const doExtrato = palavras(descricaoExtrato);
  return [...new Set(palavras(fornecedor))]
    .filter((p) => p.length >= 4 && !PALAVRAS_GENERICAS.has(p))
    .filter((p) => doExtrato.some((e) => e === p || (e.length >= 4 && p.startsWith(e)))).length;
}

export function candidatosDaLinha<D extends DespesaPar>(linha: LinhaExtratoPar, despesas: D[], rejeitadas: ReadonlySet<string> = new Set()): CandidatoPar<D>[] {
  if (linha.tipo !== "SAIDA") return [];
  const inicio = somarDias(linha.dia, -JANELA_DIAS_PAR);
  const fim = somarDias(linha.dia, JANELA_DIAS_PAR);
  return despesas
    .filter((d) => d.valorCentavos === linha.valorCentavos && d.dia >= inicio && d.dia <= fim && !rejeitadas.has(d.id))
    .map((despesa) => {
      const dias = diferencaDias(despesa.dia, linha.dia);
      const comum = palavrasEmComum(despesa.fornecedor, linha.descricao);
      return { despesa, dias, palavrasEmComum: comum, pontos: comum * 2 - dias };
    })
    .sort((a, b) => b.pontos - a.pontos || a.dias - b.dias || a.despesa.dia.localeCompare(b.despesa.dia));
}

/** Frase do "por que esse par" mostrada entre as duas pontas. */
export function motivoDoPar(c: Pick<CandidatoPar, "dias" | "palavrasEmComum">, totalCandidatos = 1): string {
  const partes = ["Mesmo valor", c.dias === 0 ? "mesma data" : `${c.dias} dia${c.dias > 1 ? "s" : ""} de diferença`];
  if (c.palavrasEmComum > 0) partes.push("fornecedor parecido");
  if (totalCandidatos > 1) partes.push(`${totalCandidatos} despesas possíveis`);
  return partes.join(", ");
}

/**
 * Negócio sugerido pra uma ENTRADA: mesmo valor exato de um único negócio,
 * ou, havendo vários, o único cujo cliente aparece na descrição (PIX/TED
 * trazem o nome de quem mandou). É só pré-seleção — não concilia sozinho.
 */
export function negocioSugeridoParaEntrada<N extends { id: string; valorCentavos: number; contatoNome: string | null }>(
  linha: Pick<LinhaExtratoPar, "descricao" | "valorCentavos" | "tipo">,
  negocios: N[],
): N | null {
  if (linha.tipo !== "ENTRADA") return null;
  const candidatos = negocios.filter((n) => n.valorCentavos === linha.valorCentavos);
  if (candidatos.length === 1) return candidatos[0];
  if (candidatos.length === 0) return null;
  const descricao = palavras(linha.descricao);
  const comNome = candidatos.filter((n) => n.contatoNome && palavras(n.contatoNome).some((p) => p.length >= 4 && descricao.includes(p)));
  return comNome.length === 1 ? comNome[0] : null;
}

/**
 * Fornecedor sugerido ao classificar uma saída sem despesa: a descrição do
 * extrato sem o prefixo do banco nem CPF/CNPJ.
 * "PAGAMENTO PIX-PIX_DEB   87687489000108 POSTO DE COMBUSTIVEIS VACCARI LTDA"
 *   -> "Posto de Combustiveis Vaccari"
 */
export function fornecedorDaDescricao(descricao: string): string {
  const limpa = descricao
    .replace(/^(PAGAMENTO|COMPRA|RECEBIMENTO|TRANSFERENCIA)\s+(PIX|CARTAO|BOLETO|TED|DOC)[-\w]*\s*/i, "")
    .replace(/\b\d{11}\b|\b\d{14}\b/g, " ")
    .replace(/\bLTDA\b|-$/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const base = limpa || descricao.trim();
  return base
    .toLowerCase()
    .split(" ")
    .map((p, i) => (p.length <= 2 && i > 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}
