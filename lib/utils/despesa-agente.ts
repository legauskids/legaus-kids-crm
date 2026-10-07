// Regras do agente financeiro do WhatsApp (pedido de 2026-10-07), puras e
// testáveis: o modelo só EXTRAI o que entendeu da mensagem (valor,
// fornecedor, como a data foi falada, categoria e centro dito ou deduzido);
// quem decide se registra direto ou pede confirmação é o código abaixo.
//
// Registra direto só quando: não é comprovante, a categoria E o centro foram
// ditos com essas palavras ("categoria alimentação, centro de custo
// instalação"), e o valor e o fornecedor aparecem na própria mensagem. Em
// qualquer outro caso vira rascunho e pede "1" ou a correção.

import { pendenciasDaDespesa, textoParaCentavos, type OrigemDespesa } from "./despesas";
import { diaDaSemana, somarDias } from "./brasilia";
import { sugerirCentroCusto } from "./centro-custo";

export type ExtracaoDespesa = {
  /** Em reais, como o modelo entendeu. */
  valor?: number | null;
  fornecedor?: string | null;
  /** A data como foi falada ("ontem", "dia 5", "segunda") — vazio = hoje. */
  dataTexto?: string | null;
  /** AAAA-MM-DD calculado pelo modelo — só usado se dataTexto não resolver. */
  data?: string | null;
  categoria?: string | null;
  centro?: string | null;
  descricao?: string | null;
};

export type CategoriaAgente = { id: string; nome: string; centroGeralPadraoId: string | null; palavrasChave?: string[] };
export type CentroGeralAgente = { id: string; nome: string };
export type NegocioAgente = { id: string; titulo: string; contatoNome: string | null };

const REGEX_DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");

export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(REGEX_DIACRITICOS, "").toLowerCase();
}

function palavras(texto: string): string[] {
  return normalizar(texto).split(/[^a-z0-9]+/).filter(Boolean);
}

/** Palavras que não identificam nada sozinhas. */
const PALAVRAS_VAZIAS = new Set([
  "de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "no", "na", "em", "pra", "para", "pro", "com", "the",
  "obra", "projeto", "negocio", "cliente", "centro", "custo", "custos", "categoria", "ltda", "me", "eireli", "equipe",
]);

function palavrasSignificativas(texto: string): string[] {
  return palavras(texto).filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p));
}

/** Uma palavra casa com outra se forem iguais ou uma começar pela outra (4+ letras: "tarifa" ~ "tarifas"). */
function casam(a: string, b: string): boolean {
  if (a === b) return true;
  const [curta, longa] = a.length <= b.length ? [a, b] : [b, a];
  return curta.length >= 4 && longa.startsWith(curta);
}

const NUMEROS_POR_EXTENSO: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400,
  quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700,
  oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900,
};

/**
 * Valores falados por extenso, como a transcrição às vezes escreve:
 * "duzentos e cinquenta reais" -> 25000; "mil e quinhentos" -> 150000;
 * "noventa e seis reais e cinquenta centavos" -> 9650.
 */
function valoresPorExtenso(texto: string): number[] {
  const tokens = palavras(texto);
  const valores: number[] = [];
  let i = 0;
  const lerNumero = (): number | null => {
    let total = 0;
    let atual = 0;
    let leu = false;
    while (i < tokens.length) {
      const t = tokens[i];
      if (t in NUMEROS_POR_EXTENSO) {
        atual += NUMEROS_POR_EXTENSO[t];
        leu = true;
      } else if (t === "mil") {
        total += (atual || 1) * 1000;
        atual = 0;
        leu = true;
      } else if (t === "e" && leu && (tokens[i + 1] in NUMEROS_POR_EXTENSO || tokens[i + 1] === "mil")) {
        // "duzentos e cinquenta"
      } else break;
      i++;
    }
    return leu ? total + atual : null;
  };
  while (i < tokens.length) {
    const reais = lerNumero();
    if (reais === null) {
      i++;
      continue;
    }
    let centavos = 0;
    if (tokens[i] === "reais" || tokens[i] === "real") {
      if (tokens[i + 1] === "e") {
        const volta = i;
        i += 2;
        const c = lerNumero();
        if (c !== null && tokens[i]?.startsWith("centavo")) centavos = c;
        else i = volta + 1;
      }
    }
    valores.push(reais * 100 + centavos);
  }
  return valores;
}

/** Valores em centavos escritos na mensagem: "250 reais", "R$ 480", "96", "1.234,56", "duzentos e cinquenta reais". */
export function valoresDoTexto(texto: string): number[] {
  const achados = texto.match(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?/g) ?? [];
  return [...achados.map(textoParaCentavos), ...valoresPorExtenso(texto)].filter((v) => Number.isFinite(v) && v > 0);
}

/** Todas as palavras do fornecedor (3+ letras, fora as genéricas) estão na mensagem. */
export function fornecedorNaMensagem(fornecedor: string, texto: string): boolean {
  const doTexto = palavras(texto);
  const doFornecedor = palavrasSignificativas(fornecedor);
  return doFornecedor.length > 0 && doFornecedor.every((p) => doTexto.some((t) => casam(p, t)));
}

/**
 * O que a pessoa DECLAROU depois de "categoria" ou de "centro (de custo)",
 * até a próxima vírgula/ponto ou o outro rótulo. null se não declarou.
 * "..., categoria alimentação, centro de custo instalação" -> "alimentação" / "instalação"
 */
export function trechoDeclarado(texto: string, rotulo: "categoria" | "centro"): string | null {
  const regex =
    rotulo === "categoria"
      ? /\bcategoria\s*(?:é|e|:|=|de|da|do|como)?\s+([^,.;\n]+)/i
      : /\bcentro(?:\s+de\s+custos?)?\s*(?:é|e|:|=|de|da|do|como)?\s+([^,.;\n]+)/i;
  const m = texto.match(regex);
  if (!m) return null;
  const outro = rotulo === "categoria" ? /\s+(?:e\s+)?(?:no\s+|o\s+)?centro\b.*$/i : /\s+(?:e\s+)?(?:na\s+|a\s+)?categoria\b.*$/i;
  const trecho = m[1].replace(outro, "").trim();
  return trecho || null;
}

/** Categoria pelo nome (aproximado): "alimentação", "combustível" -> "Veículos e combustível". Empate = null. */
export function resolverCategoria<C extends { nome: string }>(texto: string | null | undefined, categorias: C[]): C | null {
  if (!texto?.trim()) return null;
  const alvo = normalizar(texto.trim());
  const exata = categorias.find((c) => normalizar(c.nome) === alvo);
  if (exata) return exata;
  const doTexto = palavrasSignificativas(texto);
  let melhor: { c: C; pontos: number } | null = null;
  let empate = false;
  for (const c of categorias) {
    const daCategoria = palavrasSignificativas(c.nome);
    const pontos = doTexto.filter((p) => daCategoria.some((q) => casam(p, q))).length;
    if (pontos === 0) continue;
    if (!melhor || pontos > melhor.pontos) {
      melhor = { c, pontos };
      empate = false;
    } else if (pontos === melhor.pontos) {
      empate = true;
    }
  }
  return melhor && !empate ? melhor.c : null;
}

export type CentroResolvido = { tipo: "GERAL"; id: string; nome: string } | { tipo: "NEGOCIO"; id: string; nome: string };

/**
 * Centro de custo: primeiro os centros gerais (Veículos, Produção...), depois
 * os negócios pelo título ou nome do cliente ("obra do Arco-Íris" ->
 * "Playground Escola Arco-Íris"). Só devolve negócio se um só tiver o maior
 * número de palavras em comum.
 */
export function resolverCentro(
  texto: string | null | undefined,
  centrosGerais: CentroGeralAgente[],
  negocios: NegocioAgente[],
): CentroResolvido | null {
  if (!texto?.trim()) return null;
  const geral = resolverCategoria(texto, centrosGerais);
  if (geral) return { tipo: "GERAL", id: geral.id, nome: geral.nome };
  const doTexto = palavrasSignificativas(texto);
  if (doTexto.length === 0) return null;
  let melhor: { n: NegocioAgente; pontos: number } | null = null;
  let empate = false;
  for (const n of negocios) {
    const doNegocio = palavrasSignificativas(`${n.titulo} ${n.contatoNome ?? ""}`);
    const pontos = doTexto.filter((p) => doNegocio.some((q) => casam(p, q))).length;
    if (pontos === 0) continue;
    if (!melhor || pontos > melhor.pontos) {
      melhor = { n, pontos };
      empate = false;
    } else if (pontos === melhor.pontos) {
      empate = true;
    }
  }
  return melhor && !empate ? { tipo: "NEGOCIO", id: melhor.n.id, nome: melhor.n.titulo } : null;
}

/**
 * Negócios com mais palavras em comum com o que foi dito, pra sugerir quando
 * o nome não bate com um só (ex.: "KidPlay e julho" — a transcrição errou
 * "Ijuí" — empata entre todos os "Kidplay ...").
 */
export function negociosParecidos(texto: string, negocios: NegocioAgente[], limite = 4): NegocioAgente[] {
  const doTexto = palavrasSignificativas(texto);
  return negocios
    .map((n, ordem) => {
      const doNegocio = palavrasSignificativas(`${n.titulo} ${n.contatoNome ?? ""}`);
      return { n, ordem, pontos: doTexto.filter((p) => doNegocio.some((q) => casam(p, q))).length };
    })
    .filter((x) => x.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.ordem - b.ordem)
    .slice(0, limite)
    .map((x) => x.n);
}

/**
 * Mesma despesa já registrada? Mesmo valor, data a até 3 dias e fornecedor
 * parecido (ou sem fornecedor de um dos lados) — ex.: o comprovante mandado
 * depois do áudio do mesmo gasto, ou o mesmo PDF mandado duas vezes.
 */
export function pareceMesmaDespesa(
  a: { valorCentavos: number; dia: string; fornecedor: string },
  b: { valorCentavos: number; dia: string; fornecedor: string },
): boolean {
  if (a.valorCentavos <= 0 || a.valorCentavos !== b.valorCentavos) return false;
  const dias = Math.abs(new Date(`${a.dia}T12:00:00Z`).getTime() - new Date(`${b.dia}T12:00:00Z`).getTime()) / 86_400_000;
  if (dias > 3) return false;
  const pa = palavrasSignificativas(a.fornecedor);
  const pb = palavrasSignificativas(b.fornecedor);
  return pa.length === 0 || pb.length === 0 || pa.some((p) => pb.some((q) => casam(p, q)));
}

const DIAS_SEMANA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function diaValido(ano: number, mes: number, dia: number): string | null {
  const iso = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

/** Dia/mês sem ano: o mais recente que não está no futuro (gasto é sempre passado). */
function maisRecente(mes: number, dia: number, hoje: string, ano?: number): string | null {
  const anoHoje = Number(hoje.slice(0, 4));
  if (ano) return diaValido(ano, mes, dia);
  const desteAno = diaValido(anoHoje, mes, dia);
  if (desteAno && desteAno <= hoje) return desteAno;
  return diaValido(anoHoje - 1, mes, dia);
}

/**
 * Data falada -> AAAA-MM-DD. "hoje", "ontem", "anteontem", "segunda"
 * (a mais recente, hoje inclusive), "dia 5", "5/10", "05/10/2026",
 * "5 de outubro". null se não entender.
 */
export function resolverDataFalada(texto: string | null | undefined, hoje: string): string | null {
  if (!texto?.trim()) return null;
  const t = normalizar(texto);
  if (/\b(antes de ontem|anteontem)\b/.test(t)) return somarDias(hoje, -2);
  if (/\bontem\b/.test(t)) return somarDias(hoje, -1);
  if (/\bhoje\b|\bagora\b|\bacabei\b/.test(t)) return hoje;

  const semana = DIAS_SEMANA.findIndex((d) => new RegExp(`\\b${d}`).test(t));
  if (semana >= 0) {
    const atras = (diaDaSemana(hoje) - semana + 7) % 7;
    return somarDias(hoje, /passad/.test(t) && atras === 0 ? -7 : -atras);
  }

  const barra = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (barra) {
    const ano = barra[3] ? Number(barra[3].length === 2 ? `20${barra[3]}` : barra[3]) : undefined;
    return maisRecente(Number(barra[2]), Number(barra[1]), hoje, ano);
  }

  const porExtenso = t.match(/\b(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?/);
  if (porExtenso) {
    const mes = MESES.findIndex((m) => m.startsWith(porExtenso[2].slice(0, 3)));
    if (mes >= 0) return maisRecente(mes + 1, Number(porExtenso[1]), hoje, porExtenso[3] ? Number(porExtenso[3]) : undefined);
  }

  const soDia = t.match(/\bdia\s+(\d{1,2})\b/);
  if (soDia) {
    const dia = Number(soDia[1]);
    const mesHoje = Number(hoje.slice(5, 7));
    const desteMes = diaValido(Number(hoje.slice(0, 4)), mesHoje, dia);
    if (desteMes && desteMes <= hoje) return desteMes;
    const anterior = somarDias(`${hoje.slice(0, 8)}01`, -1);
    return diaValido(Number(anterior.slice(0, 4)), Number(anterior.slice(5, 7)), dia);
  }
  return null;
}

export type DespesaMontada = {
  dados: {
    dia: string;
    valorCentavos: number;
    fornecedor: string;
    descricao: string | null;
    categoriaId: string | null;
    centroGeralId: string | null;
    negocioId: string | null;
  };
  nomes: { categoria: string | null; centro: string | null; centroEhProjeto: boolean };
  categoriaDeclarada: boolean;
  centroDeclarado: boolean;
  valorNaMensagem: boolean;
  fornecedorNaMensagem: boolean;
  faltando: string[];
  registrarDireto: boolean;
  /** Por que pediu confirmação (vazio quando registra direto) — vai pro log. */
  motivos: string[];
};

/**
 * Junta a extração do modelo com a mensagem original e os cadastros e
 * decide: registrar direto ou pedir confirmação.
 */
export function montarDespesaDaMensagem(input: {
  texto: string;
  origem: OrigemDespesa;
  hoje: string;
  extracao: ExtracaoDespesa;
  categorias: CategoriaAgente[];
  centrosGerais: CentroGeralAgente[];
  negocios: NegocioAgente[];
}): DespesaMontada {
  const { texto, extracao, categorias, centrosGerais, negocios, hoje } = input;

  const trechoCategoria = trechoDeclarado(texto, "categoria");
  const categoriaDita = resolverCategoria(trechoCategoria, categorias);
  // Sem categoria dita nem deduzida pelo modelo: as palavras-chave das
  // categorias (as mesmas da conciliação) na mensagem e no fornecedor.
  const categoria =
    categoriaDita ??
    resolverCategoria(extracao.categoria, categorias) ??
    sugerirCentroCusto(
      `${texto} ${extracao.fornecedor ?? ""}`,
      "SAIDA",
      categorias.map((c) => ({ ...c, tipo: "DESPESA" as const, palavrasChave: c.palavrasChave ?? [] })),
    );

  const trechoCentro = trechoDeclarado(texto, "centro");
  const centroDito = resolverCentro(trechoCentro, centrosGerais, negocios);
  let centro = centroDito ?? resolverCentro(extracao.centro, centrosGerais, negocios);
  if (!centro && categoria?.centroGeralPadraoId) {
    const padrao = centrosGerais.find((g) => g.id === categoria.centroGeralPadraoId);
    if (padrao) centro = { tipo: "GERAL", id: padrao.id, nome: padrao.nome };
  }

  const dataModelo = extracao.data && /^\d{4}-\d{2}-\d{2}$/.test(extracao.data) && extracao.data <= hoje ? extracao.data : null;
  const dia = resolverDataFalada(extracao.dataTexto, hoje) ?? dataModelo ?? hoje;

  const valorCentavos = extracao.valor && extracao.valor > 0 ? Math.round(extracao.valor * 100) : 0;
  const fornecedor = (extracao.fornecedor ?? "").trim();
  const dados = {
    dia,
    valorCentavos,
    fornecedor,
    descricao: extracao.descricao?.trim() || null,
    categoriaId: categoria?.id ?? null,
    centroGeralId: centro?.tipo === "GERAL" ? centro.id : null,
    negocioId: centro?.tipo === "NEGOCIO" ? centro.id : null,
  };

  const faltando = pendenciasDaDespesa(dados);
  const valorNaMensagem = valorCentavos > 0 && valoresDoTexto(texto).includes(valorCentavos);
  const fornecedorNaMsg = fornecedor !== "" && fornecedorNaMensagem(fornecedor, texto);
  const categoriaDeclarada = Boolean(categoriaDita) && categoriaDita?.nome === categoria?.nome;
  const centroDeclarado = Boolean(centroDito) && centroDito?.id === centro?.id;

  const motivos: string[] = [];
  if (input.origem === "COMPROVANTE") motivos.push("comprovante sempre pede confirmação");
  if (faltando.length) motivos.push(`faltou: ${faltando.join(", ")}`);
  if (!categoriaDeclarada) motivos.push("categoria deduzida");
  if (!centroDeclarado) motivos.push("centro deduzido");
  if (!valorNaMensagem) motivos.push("valor não está escrito na mensagem");
  if (!fornecedorNaMsg) motivos.push("fornecedor incerto");

  return {
    dados,
    nomes: { categoria: categoria?.nome ?? null, centro: centro?.nome ?? null, centroEhProjeto: centro?.tipo === "NEGOCIO" },
    categoriaDeclarada,
    centroDeclarado,
    valorNaMensagem,
    fornecedorNaMensagem: fornecedorNaMsg,
    faltando,
    registrarDireto: motivos.length === 0,
    motivos,
  };
}

function diaCurto(dia: string, hoje: string): string {
  const [, mes, d] = dia.split("-");
  const rotulo = dia === hoje ? " (hoje)" : dia === somarDias(hoje, -1) ? " (ontem)" : "";
  return `${d}/${mes}${rotulo}`;
}

function reais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");
}

/** Onde a conversa acontece: no WhatsApp o resumo vai seguido de uma enquete pra tocar. */
export type CanalDespesa = "whatsapp" | "crm";

export function canalDoIdentificador(identificador: string): CanalDespesa {
  return identificador.startsWith("crm:") ? "crm" : "whatsapp";
}

/**
 * Resumo do rascunho pedindo confirmação. Pedido do Marcos (2026-10-07,
 * depois do primeiro teste): confirmar tocando um botão ou por áudio, não
 * digitando "1" — no WhatsApp vem a enquete logo abaixo (ver
 * enqueteDaDespesa), e "sim" por texto ou áudio também vale. E sempre
 * perguntar se a despesa é de algum negócio quando o centro não for um.
 */
export function mensagemDeConfirmacao(
  d: Pick<DespesaMontada, "dados" | "nomes" | "faltando"> & { categoriaDeclarada?: boolean; centroDeclarado?: boolean },
  hoje: string,
  intro = "Entendi assim, confere?",
  canal: CanalDespesa = "whatsapp",
): string {
  const linhas = [
    intro,
    `💸 *${d.dados.valorCentavos > 0 ? reais(d.dados.valorCentavos) : "valor?"}* — ${d.dados.fornecedor || "fornecedor?"}`,
    `📅 ${diaCurto(d.dados.dia, hoje)}`,
    `🏷️ Categoria: ${d.nomes.categoria ?? "?"}${d.nomes.categoria && d.categoriaDeclarada === false ? " _(deduzida)_" : ""}`,
    `🎯 Centro: ${d.nomes.centro ?? "?"}${d.nomes.centroEhProjeto ? " (obra)" : ""}${d.nomes.centro && d.centroDeclarado === false ? " _(deduzido)_" : ""}`,
  ];
  if (d.faltando.length) linhas.push(`Não consegui identificar: ${d.faltando.join(", ")}.`);
  if (!d.nomes.centroEhProjeto) linhas.push("", "🏗️ É de algum negócio/obra? Me diga o nome que eu vinculo.");
  linhas.push(
    "",
    canal === "whatsapp"
      ? "Confirme na enquete abaixo ou responda *sim* (texto ou áudio). Se algo estiver errado, me diga o que corrigir."
      : "Responda *sim* para confirmar ou me diga o que corrigir.",
  );
  return linhas.join("\n");
}

export const OPCAO_CONFIRMAR = "✅ Confirmar";
export const OPCAO_NEGOCIO = "🏗️ É de um negócio";
export const OPCAO_DESCARTAR = "❌ Descartar";

export type Enquete = { pergunta: string; opcoes: string[]; ref: string };

/** Enquete do WhatsApp que acompanha o resumo — o voto volta por /api/agente/enquete com o ref. */
export function enqueteDaDespesa(d: { id: string; valorCentavos: number; fornecedor: string; ehProjeto: boolean }): Enquete {
  const valor = d.valorCentavos > 0 ? reais(d.valorCentavos) : "valor a definir";
  return {
    pergunta: `Confirmar a despesa de ${valor}${d.fornecedor ? ` — ${d.fornecedor}` : ""}?`.slice(0, 250),
    opcoes: d.ehProjeto ? [OPCAO_CONFIRMAR, OPCAO_DESCARTAR] : [OPCAO_CONFIRMAR, OPCAO_NEGOCIO, OPCAO_DESCARTAR],
    ref: `despesa:${d.id}`,
  };
}

export function mensagemDeRegistro(d: Pick<DespesaMontada, "dados" | "nomes">, hoje: string, prefixo = "✅ Registrado"): string {
  return (
    `${prefixo}: *${reais(d.dados.valorCentavos)}* em ${d.dados.fornecedor} — ${d.nomes.categoria}, ${d.nomes.centro}` +
    ` (${diaCurto(d.dados.dia, hoje)}). Fica aguardando o extrato pra conciliar.`
  );
}

/**
 * A resposta do modelo tem cara de resumo/registro de despesa — se nenhuma
 * ferramenta de despesa rodou, é inventada (visto no teste de 2026-10-07: com
 * a mesma frase no histórico, o modelo copiou o resumo em vez de chamar a
 * ferramenta, e nada foi gravado).
 */
export function pareceRespostaDeDespesa(texto: string): boolean {
  return /para confirmar|confirme na enquete|✅ registrad|corrigi, confere|💸/i.test(texto);
}

// Resposta ao rascunho, digitada ou falada (a transcrição vem com pontuação
// e palavras a mais: "Sim, pode confirmar.", "Um.", "Tá certo, pode
// registrar"). Vale se TODAS as palavras forem desse vocabulário e houver
// pelo menos uma "forte"; qualquer conteúdo a mais ("não, foi 260") vai pro
// modelo como correção.
const PALAVRAS_CONFIRMAR_FORTES = new Set([
  "1", "um", "sim", "s", "ss", "ok", "okay", "oke", "isso", "certo", "correto", "exato", "beleza", "perfeito", "positivo", "fechado", "claro",
  "confirma", "confirmo", "confirmado", "confirmar", "confirme", "confirmada", "pode", "registra", "registrar", "registre", "salva", "salvar", "salve",
]);
const PALAVRAS_CONFIRMAR_LIGACAO = new Set(["ta", "esta", "tudo", "mesmo", "ai", "e", "pode", "la", "entao", "por", "favor", "a", "despesa", "essa", "isso"]);
const PALAVRAS_DESCARTAR_FORTES = new Set(["cancela", "cancelar", "cancele", "descarta", "descartar", "descarte", "esquece", "esqueca", "apaga", "apagar", "apague", "exclui", "excluir"]);
const PALAVRAS_DESCARTAR_LIGACAO = new Set(["nao", "pode", "essa", "isso", "a", "despesa", "pra", "la", "deixa", "tudo", "por", "favor", "registra", "registrar"]);

/**
 * "1"/"sim"/"pode confirmar" = confirmar; "cancela"/"descarta" = descartar;
 * "não" sozinho = "duvida" (pergunta o que corrigir em vez de apagar); o
 * resto = "outro" (vai pro modelo como correção ou comando novo).
 */
export function interpretarRespostaRascunho(texto: string): "confirmar" | "descartar" | "duvida" | "outro" {
  const ps = palavras(texto);
  if (ps.length === 0 || ps.length > 8) return "outro";
  if (ps.every((p) => p === "nao" || p === "n")) return "duvida";
  if (ps.every((p) => PALAVRAS_CONFIRMAR_FORTES.has(p) || PALAVRAS_CONFIRMAR_LIGACAO.has(p)) && ps.some((p) => PALAVRAS_CONFIRMAR_FORTES.has(p))) {
    return "confirmar";
  }
  if (ps.every((p) => PALAVRAS_DESCARTAR_FORTES.has(p) || PALAVRAS_DESCARTAR_LIGACAO.has(p)) && ps.some((p) => PALAVRAS_DESCARTAR_FORTES.has(p))) {
    return "descartar";
  }
  // "não registra", "não, pode descartar" já caíram acima; "não precisa registrar" vai pro modelo.
  if (ps.every((p) => PALAVRAS_DESCARTAR_LIGACAO.has(p)) && ps.includes("nao") && ps.some((p) => p.startsWith("registr"))) return "descartar";
  return "outro";
}
