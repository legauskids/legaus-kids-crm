// Cotações de fornecedores (pedido de 2026-11-24), puras e testáveis: a data
// e a validade da cotação, o nome fácil de achar, o fornecedor comparável, a
// busca por produto ("piso emborrachado 15mm") e as mensagens do agente.
// Preço guardado como veio no documento (decisão do Marcos): nada de somar
// IPI ou frete — as condições ficam em texto junto.

import { somarDias } from "./brasilia";
import { dataBR } from "./contas-pagar";
import type { Botoes } from "./agente-canal";

/** O que o modelo leu do documento ou da mensagem (valores em reais). */
export type ExtracaoCotacao = {
  fornecedor?: { nome?: string | null; cnpj?: string | null; telefone?: string | null; email?: string | null; cidade?: string | null; vendedor?: string | null } | null;
  /** Data da cotação como está no documento ou como foi falada; vazio = hoje. */
  dataTexto?: string | null;
  /** "10 dias", "validade 30/12/2026"… */
  validadeTexto?: string | null;
  /** Produtos principais em poucas palavras, pro nome: "Piso emborrachado 15 e 20mm". */
  resumo?: string | null;
  itens?: ItemExtraido[] | null;
  frete?: string | null;
  prazoEntrega?: string | null;
  pagamento?: string | null;
  impostos?: string | null;
  observacoes?: string | null;
  total?: number | null;
  /** Cliente/obra, se disserem que a cotação é pra um negócio. */
  negocio?: string | null;
};

export type ItemExtraido = {
  descricao?: string | null;
  unidade?: string | null;
  quantidade?: number | null;
  precoUnitario?: number | null;
  total?: number | null;
  observacao?: string | null;
};

export type ItemCotacao = {
  descricao: string;
  unidade: string | null;
  quantidade: number | null;
  precoUnitarioCentavos: number | null;
  totalCentavos: number | null;
  observacao: string | null;
};

const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function diaValido(ano: number, mes: number, dia: number): string | null {
  const iso = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

/** Uma data no texto (aaaa-mm-dd, dd/mm/aaaa, dd/mm/aa, dd/mm, "24 de novembro [de 2026]"); sem ano → `semAno(mes, dia)`. */
function dataNoTexto(texto: string, semAno: (mes: number, dia: number) => string | null): string | null {
  const iso = texto.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return diaValido(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const t = semAcento(texto.toLowerCase());
  const barra = t.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
  if (barra) {
    if (barra[3]) return diaValido(Number(barra[3].length === 2 ? `20${barra[3]}` : barra[3]), Number(barra[2]), Number(barra[1]));
    return semAno(Number(barra[2]), Number(barra[1]));
  }
  const extenso = t.match(/\b(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?/);
  if (extenso) {
    const mes = MESES.findIndex((m) => m.startsWith(extenso[2].slice(0, 3)));
    if (mes >= 0) return extenso[3] ? diaValido(Number(extenso[3]), mes + 1, Number(extenso[1])) : semAno(mes + 1, Number(extenso[1]));
  }
  return null;
}

/**
 * Dia da cotação (AAAA-MM-DD). Impressa ou falada; sem ano, a mais recente
 * até hoje ("20/11" em janeiro é do ano passado); "ontem"; sem data = hoje.
 * Data no futuro não vale (é a validade ou a entrega) — fica hoje.
 */
export function dataDaCotacao(texto: string | null | undefined, hoje: string): string {
  if (!texto?.trim()) return hoje;
  const t = semAcento(texto.toLowerCase());
  if (/\banteontem\b/.test(t)) return somarDias(hoje, -2);
  if (/\bontem\b/.test(t)) return somarDias(hoje, -1);
  const ano = Number(hoje.slice(0, 4));
  const data = dataNoTexto(texto, (mes, dia) => {
    const desteAno = diaValido(ano, mes, dia);
    return desteAno && desteAno <= hoje ? desteAno : diaValido(ano - 1, mes, dia);
  });
  return data && data <= hoje ? data : hoje;
}

/** Validade: "10 dias" (contados da data da cotação) ou uma data (sem ano, a próxima a partir da cotação). null se não der. */
export function validadeDaCotacao(texto: string | null | undefined, data: string): string | null {
  if (!texto?.trim()) return null;
  const dias = semAcento(texto.toLowerCase()).match(/\b(\d{1,3})\s*dias?\b/);
  if (dias) return somarDias(data, Number(dias[1]));
  const ano = Number(data.slice(0, 4));
  const validade = dataNoTexto(texto, (mes, dia) => {
    const desteAno = diaValido(ano, mes, dia);
    return desteAno && desteAno >= data ? desteAno : diaValido(ano + 1, mes, dia);
  });
  return validade && validade >= data ? validade : null;
}

function centavos(reais: number | null | undefined): number | null {
  return typeof reais === "number" && Number.isFinite(reais) && reais >= 0 ? Math.round(reais * 100) : null;
}

function texto(valor: string | null | undefined, maximo = 500): string | null {
  const limpo = valor?.replace(/\s+/g, " ").trim();
  return limpo && !/^<?unknown>?$/i.test(limpo) ? limpo.slice(0, maximo) : null;
}

/** Itens da extração: sem descrição não entra; valores em centavos, como vieram. */
export function itensDaExtracao(itens: ItemExtraido[] | null | undefined): ItemCotacao[] {
  return (itens ?? []).flatMap((i) => {
    const descricao = texto(i.descricao, 300);
    if (!descricao) return [];
    const quantidade = typeof i.quantidade === "number" && Number.isFinite(i.quantidade) && i.quantidade > 0 ? i.quantidade : null;
    return [{ descricao, unidade: texto(i.unidade, 20), quantidade, precoUnitarioCentavos: centavos(i.precoUnitario), totalCentavos: centavos(i.total), observacao: texto(i.observacao, 300) }];
  });
}

export function campoDeTexto(valor: string | null | undefined): string | null {
  return texto(valor);
}

/** Nome fácil de achar: "Borrachas Sul · Piso emborrachado 15 e 20mm · nov/2026". */
export function tituloDaCotacao(fornecedor: string, resumo: string | null | undefined, itens: { descricao: string }[], data: string): string {
  const produtos =
    texto(resumo, 70) ??
    (itens.length ? `${itens[0].descricao.length > 50 ? `${itens[0].descricao.slice(0, 49)}…` : itens[0].descricao}${itens.length > 1 ? ` e mais ${itens.length - 1}` : ""}` : "sem itens");
  return `${fornecedor} · ${produtos} · ${MESES_CURTOS[Number(data.slice(5, 7)) - 1]}/${data.slice(0, 4)}`;
}

const SUFIXOS_EMPRESA = /\b(ltda|me|epp|eireli|s\/?a|s\.a|cia|industria|comercio|ind|com)\b\.?/g;

/** Nome de empresa comparável: sem acento, sem "Ltda", "ME", "Comércio"… ("Borrachas Sul Ltda" = "borrachas sul"). */
export function nomeDeEmpresaComparavel(nome: string): string {
  return semAcento(nome.toLowerCase())
    .replace(/[&]/g, " e ")
    .replace(SUFIXOS_EMPRESA, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(e|de|do|da|dos|das)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));

/** "Cascavel - PR", "Ijuí/RS", "Ijuí, RS" → cidade e UF separadas (pro cadastro do fornecedor). */
export function cidadeEUf(texto: string | null | undefined): { cidade: string | null; uf: string | null } {
  const limpo = texto?.replace(/\s+/g, " ").trim();
  if (!limpo) return { cidade: null, uf: null };
  const m = limpo.match(/^(.*?)\s*[-/,–]\s*([A-Za-z]{2})$/);
  if (m && UFS.has(m[2].toUpperCase()) && m[1].trim()) return { cidade: m[1].trim(), uf: m[2].toUpperCase() };
  return { cidade: limpo, uf: null };
}

/**
 * O mesmo fornecedor pelo nome: igual (sem Ltda, Comércio…), ou o nome mais
 * longo começa pelo mais curto, de 2 palavras ou mais ("Borrachas Sul" =
 * "Borrachas Sul Filial Ijuí"). "Super Piso Fácil" não é "Piso Fácil".
 */
export function mesmoFornecedor(a: string, b: string): boolean {
  const x = nomeDeEmpresaComparavel(a);
  const y = nomeDeEmpresaComparavel(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [curto, longo] = x.length <= y.length ? [x, y] : [y, x];
  return curto.split(" ").length >= 2 && `${longo} `.startsWith(`${curto} `);
}

// Busca por produto. Medida junta ("15 mm" = "15mm", "50 x 50" = "50x50",
// "m²" = "m2"), sem acento, palavra com o fim cortado ("emborrachado" acha
// "emborrachada"); número com medida tem que bater exato ("15mm" não acha
// "150mm" nem "20mm").

const PALAVRAS_VAZIAS = new Set(["de", "da", "do", "das", "dos", "com", "para", "pra", "e", "em", "o", "a", "os", "as", "um", "uma", "no", "na", "por"]);

export function normalizarBusca(valor: string): string {
  return semAcento(valor.toLowerCase().replace(/²/g, "2").replace(/³/g, "3"))
    .replace(/(\d)\s*[xX×]\s*(\d)/g, "$1x$2")
    .replace(/(\d)\s+(mm|cm|m|m2|m3|mt|mts|kg|g|l|ml|un|pol|")(?=[^a-z0-9]|$)/g, "$1$2")
    .replace(/[^a-z0-9,.x" ]/g, " ")
    .replace(/(?<!\d)[.,]|[.,](?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function raiz(palavra: string): string {
  if (palavra.length < 5 || /\d/.test(palavra)) return palavra;
  return palavra.replace(/s$/, "").replace(/[aeo]$/, "");
}

function partesDoTermo(termo: string): string[] {
  return normalizarBusca(termo)
    .split(" ")
    .filter((p) => p && !PALAVRAS_VAZIAS.has(p))
    .map(raiz);
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 0 a 1: quanto do termo aparece no texto. Número/medida que não aparece zera. */
export function pontosDoTermo(termo: string, textoItem: string): number {
  const partes = partesDoTermo(termo);
  if (!partes.length) return 0;
  const alvo = normalizarBusca(textoItem);
  let achadas = 0;
  for (const parte of partes) {
    const achou = /\d/.test(parte) ? new RegExp(`(^|[^\\d,.])${escaparRegex(parte)}($|[^\\d])`).test(alvo) : alvo.includes(parte);
    if (achou) achadas++;
    else if (/\d/.test(parte)) return 0;
  }
  return achadas / partes.length;
}

/** Itens que combinam com algum dos termos (variações do mesmo pedido), do mais parecido pro menos. */
export function itensQueCombinam<T extends { descricao: string; observacao?: string | null }>(termos: string[], itens: T[], minimo = 0.6): { item: T; pontos: number }[] {
  const validos = termos.map((t) => t.trim()).filter(Boolean);
  if (!validos.length) return [];
  return itens
    .map((item) => ({ item, pontos: Math.max(...validos.map((t) => pontosDoTermo(t, `${item.descricao} ${item.observacao ?? ""}`))) }))
    .filter((r) => r.pontos >= minimo)
    .sort((a, b) => b.pontos - a.pontos);
}

/** "há 3 meses", "hoje", "há 12 dias" — pra avisar preço velho. */
export function idadeDaCotacao(data: string, hoje: string): string {
  const dias = Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${data}T12:00:00Z`)) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 45) return `há ${dias} dias`;
  const meses = Math.round(dias / 30.4);
  return meses < 12 ? `há ${meses} meses` : `há ${Math.floor(meses / 12)} ano${meses >= 24 ? "s" : ""}${meses % 12 ? ` e ${meses % 12} ${meses % 12 === 1 ? "mês" : "meses"}` : ""}`;
}

function reais(centavosValor: number): string {
  return (centavosValor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");
}

function numero(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

/** "R$ 89,90/m² · 120 m² = R$ 10.788,00" */
export function precoDoItem(i: Pick<ItemCotacao, "unidade" | "quantidade" | "precoUnitarioCentavos" | "totalCentavos">): string {
  const partes: string[] = [];
  if (i.precoUnitarioCentavos !== null) partes.push(`${reais(i.precoUnitarioCentavos)}${i.unidade ? `/${i.unidade}` : ""}`);
  if (i.quantidade !== null || i.totalCentavos !== null) {
    const qtd = i.quantidade !== null ? `${numero(i.quantidade)}${i.unidade ? ` ${i.unidade}` : ""}` : "";
    partes.push([qtd, i.totalCentavos !== null ? reais(i.totalCentavos) : ""].filter(Boolean).join(" = "));
  }
  return partes.join(" · ") || "sem preço";
}

export type ResumoCotacao = {
  numero: number;
  titulo: string;
  fornecedorNome: string;
  fornecedorNovo?: boolean;
  data: string;
  validade: string | null;
  itens: ItemCotacao[];
  totalCentavos: number | null;
  frete: string | null;
  prazoEntrega: string | null;
  pagamento: string | null;
  impostos: string | null;
  observacoes: string | null;
  negocio: string | null;
  arquivos: number;
};

const MAX_ITENS_NA_MENSAGEM = 15;

/** Resumo do que ficou salvo (a cotação é salva direto — decisão do Marcos — e corrige-se depois). */
export function mensagemCotacaoSalva(c: ResumoCotacao, opcoes: { juntou?: boolean; avisos?: string[] } = {}): string {
  const linhas = [
    opcoes.juntou ? `✅ Juntei na cotação de fornecedor nº ${c.numero} (mesmo fornecedor, mandada há pouco):` : `✅ Cotação de fornecedor salva — nº ${c.numero}`,
    `📦 *${c.titulo}*`,
    `🏭 Fornecedor: ${c.fornecedorNome}${c.fornecedorNovo ? " (novo no cadastro de Fornecedores)" : ""}`,
    `📅 ${dataBR(c.data)}${c.validade ? ` · válida até ${dataBR(c.validade)}` : ""}`,
    ...c.itens.slice(0, MAX_ITENS_NA_MENSAGEM).map((i, n) => `${n + 1}. ${i.descricao} — ${precoDoItem(i)}`),
  ];
  if (c.itens.length > MAX_ITENS_NA_MENSAGEM) linhas.push(`… e mais ${c.itens.length - MAX_ITENS_NA_MENSAGEM} itens (veja em Cadastros → Cotações de fornecedores)`);
  if (c.totalCentavos !== null) linhas.push(`💰 Total: ${reais(c.totalCentavos)}`);
  const condicoes = [
    c.frete && `🚚 Frete: ${c.frete}`,
    c.prazoEntrega && `⏱️ Prazo: ${c.prazoEntrega}`,
    c.pagamento && `💳 Pagamento: ${c.pagamento}`,
    c.impostos && `🧾 ${c.impostos}`,
  ].filter(Boolean);
  if (condicoes.length) linhas.push(condicoes.join(" · "));
  if (c.observacoes) linhas.push(`📝 ${c.observacoes}`);
  if (c.negocio) linhas.push(`🏗️ Obra: ${c.negocio}`);
  if (c.arquivos) linhas.push(`📎 ${c.arquivos === 1 ? "1 arquivo guardado" : `${c.arquivos} arquivos guardados`}`);
  for (const aviso of opcoes.avisos ?? []) linhas.push(`⚠️ ${aviso}`);
  linhas.push("📂 Está em Cadastros → Cotações de fornecedores.");
  linhas.push("", 'Se algo estiver errado, me diga o que corrigir (ou "apaga essa cotação").');
  return linhas.join("\n");
}

/** Telegram: apagar logo depois de salvar (ver lerBotao, cfx). */
export function botoesCotacaoSalva(cotacaoId: string): Botoes {
  return [[{ texto: "🗑️ Apagar esta cotação", dados: `cfx:${cotacaoId}` }]];
}
