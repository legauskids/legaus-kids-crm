// Contrato de compra e venda (pedido de 2026-11-12): os dados que o formulário
// pede antes de gerar (cliente, produto, pagamento, prazos), o texto do modelo
// preenchido com eles e a divisão do texto em título/seções/parágrafos — a
// mesma pro PDF, pro Word e pra prévia na tela.
import { z } from "zod";
import type { ChaveEmpresaEmissora, DadosEmpresa } from "../constants/empresa";
import { formatarDocumento } from "./busca-cliente";
import { centavosParaReais } from "./money";

// ---------------------------------------------------------------------------
// Texto: parágrafos, título e seções

/** O textarea do navegador manda \r\n — sem isso o texto inteiro virava um parágrafo só (o título, todo em maiúsculas). */
export function normalizarQuebras(texto: string): string {
  return texto.replace(/\r\n?/g, "\n");
}

// Negrito só nos títulos de seção ("1 - Dos termos...", "Cláusula 1ª — ...");
// os itens numerados menores ("1.1) Objeto:") ficam em texto normal, como no
// modelo real da Legaus Kids.
const REGEX_SECAO = /^(Cláusula|\d+\s*-\s*[A-ZÀ-Ú])/;

export type BlocoContrato = { tipo: "secao" | "paragrafo"; texto: string };

/** Um parágrafo por linha em branco; o primeiro vira o título do documento. */
export function separarContrato(conteudo: string): { titulo: string; blocos: BlocoContrato[] } {
  const [titulo, ...resto] = normalizarQuebras(conteudo)
    .split(/\n[ \t]*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    titulo: titulo || "Contrato",
    blocos: resto.map((texto) => ({ tipo: REGEX_SECAO.test(texto) ? "secao" : "paragrafo", texto })),
  };
}

/** Troca os {{campos}} e arruma o que sobrou de campo vazio (espaço duplo, parágrafo em branco). */
export function mesclarModelo(modelo: string, valores: Record<string, string>): string {
  return normalizarQuebras(modelo)
    .replace(/\{\{(\w+)\}\}/g, (original, chave: string) => valores[chave] ?? original)
    .split(/\n[ \t]*\n/)
    .map((paragrafo) =>
      paragrafo
        .split("\n")
        .map((linha) => linha.replace(/[ \t]{2,}/g, " ").replace(/ +([,.;:])/g, "$1").trim())
        .join("\n")
        .trim(),
    )
    .filter(Boolean)
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Números e valores por extenso

const UNIDADES = [
  "zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez",
  "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ate999(n: number): string {
  if (n === 100) return "cem";
  const partes: string[] = [];
  if (n >= 100) partes.push(CENTENAS[Math.floor(n / 100)]);
  const resto = n % 100;
  if (resto >= 20) partes.push(resto % 10 ? `${DEZENAS[Math.floor(resto / 10)]} e ${UNIDADES[resto % 10]}` : DEZENAS[resto / 10]);
  else if (resto > 0) partes.push(UNIDADES[resto]);
  return partes.join(" e ");
}

/** 15800 → "quinze mil e oitocentos"; 1200000 → "um milhão e duzentos mil". */
export function numeroPorExtenso(numero: number): string {
  const n = Math.floor(numero);
  if (!Number.isFinite(n) || n < 0 || n >= 1e12) return String(numero);
  if (n === 0) return "zero";
  const grupos = [
    { valor: Math.floor(n / 1e9) % 1000, um: "um bilhão", sufixo: " bilhões" },
    { valor: Math.floor(n / 1e6) % 1000, um: "um milhão", sufixo: " milhões" },
    { valor: Math.floor(n / 1e3) % 1000, um: "mil", sufixo: " mil" },
    { valor: n % 1000, um: "um", sufixo: "" },
  ]
    .filter((g) => g.valor > 0)
    .map((g) => ({ valor: g.valor, texto: g.valor === 1 ? g.um : ate999(g.valor) + g.sufixo }));
  // "e" antes do último grupo só quando ele é redondo ou pequeno: "mil e cem", "mil duzentos e trinta".
  return grupos
    .map((g, i) => {
      if (i === 0) return g.texto;
      const ultimo = i === grupos.length - 1;
      return (ultimo && (g.valor < 100 || g.valor % 100 === 0) ? " e " : " ") + g.texto;
    })
    .join("");
}

/** 1580000 centavos → "quinze mil e oitocentos reais". */
export function valorPorExtenso(centavos: number): string {
  const total = Math.max(0, Math.round(centavos));
  const reais = Math.floor(total / 100);
  const resto = total % 100;
  const partes: string[] = [];
  if (reais > 0) {
    const milhoesRedondos = reais >= 1e6 && reais % 1e6 === 0;
    partes.push(`${numeroPorExtenso(reais)}${milhoesRedondos ? " de" : ""} ${reais === 1 ? "real" : "reais"}`);
  }
  if (resto > 0) partes.push(`${numeroPorExtenso(resto)} ${resto === 1 ? "centavo" : "centavos"}`);
  return partes.join(" e ") || "zero real";
}

/** 30, "dia corrido", "dias corridos" → "30 (trinta) dias corridos". */
export function quantidadePorExtenso(n: number, singular: string, plural: string): string {
  return `${n} (${numeroPorExtenso(n)}) ${n === 1 ? singular : plural}`;
}

// ---------------------------------------------------------------------------
// Nomes: só as iniciais maiúsculas

// Ficam minúsculas no meio do nome ("Fabrica e Transportes", "Rua das Flores").
const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "na", "no", "nas", "nos", "para", "com"]);
// Siglas comuns em nome de empresa e de escola, que ficam em maiúsculas.
const SIGLAS = new Set([
  "ME", "EPP", "MEI", "S/A", "S.A.", "SA", "EIRELI", "ONG", "APAE", "ACPM", "APM", "CPM", "CTG", "EMEI", "EMEF", "EMEB",
  "CMEI", "CEI", "CEMEI", "EEEF", "EEEM", "EMEIEF", "UBS", "CRAS", "CAPS", "SESC", "SESI", "SENAI", "SENAC", "AABB",
]);
const TEM_VOGAL = /[AEIOUÁÉÍÓÚÂÊÔÃÕÀÜY]/;

function ajustarPalavra(palavra: string, primeira: boolean): string {
  const nucleo = palavra.replace(/[.,;:()"'!?]+$/g, "").replace(/^[("']+/, "");
  // Número, sigla conhecida ou palavra sem vogal (CPF, RS, CNPJ) ficam como estão.
  if (/\d/.test(palavra) || SIGLAS.has(nucleo) || !TEM_VOGAL.test(nucleo)) return palavra;
  const minuscula = palavra.toLocaleLowerCase("pt-BR");
  if (!primeira && PARTICULAS.has(nucleo.toLocaleLowerCase("pt-BR"))) return minuscula;
  return minuscula.replace(/(^|[-/("'])(\p{L})/gu, (_, antes: string, letra: string) => antes + letra.toLocaleUpperCase("pt-BR"));
}

/**
 * Nome todo em maiúsculas (como vem da Receita ou dos dados da empresa) →
 * só as iniciais maiúsculas: "GOLDLOG FABRICA E TRANSPORTES LTDA" →
 * "Goldlog Fabrica e Transportes Ltda". O que já foi digitado em caixa mista
 * fica como está.
 */
export function nomeProprio(texto: string): string {
  if (!/\p{Lu}/u.test(texto) || texto !== texto.toLocaleUpperCase("pt-BR")) return texto;
  let primeira = true;
  return texto.replace(/\S+/g, (palavra) => {
    const ajustada = ajustarPalavra(palavra, primeira);
    primeira = false;
    return ajustada;
  });
}

/** Trecho que continua uma frase do modelo ("..., entrada de R$ 5.000,00 e saldo na entrega."). */
function continuacaoDeFrase(texto: string): string {
  const t = texto.trim().replace(/[\s.;,]+$/, "").replace(/\s*\n\s*/g, " ");
  const primeiraPalavra = t.split(/\s/)[0] ?? "";
  // Começa com sigla (PIX, R$): deixa como está.
  if (primeiraPalavra.length > 1 && primeiraPalavra === primeiraPalavra.toLocaleUpperCase("pt-BR")) return t;
  return t.charAt(0).toLocaleLowerCase("pt-BR") + t.slice(1);
}

/** Frase completa: inicial maiúscula e ponto final. */
function frase(texto: string): string {
  const t = texto.trim();
  if (!t) return "";
  const comInicial = t.charAt(0).toLocaleUpperCase("pt-BR") + t.slice(1);
  return /[.!?…]$/.test(comInicial) ? comInicial : `${comInicial}.`;
}

// ---------------------------------------------------------------------------
// CPF e CNPJ

const soNumeros = (s: string) => s.replace(/\D/g, "");

export function cpfValido(cpf: string): boolean {
  const n = soNumeros(cpf);
  if (n.length !== 11 || /^(\d)\1+$/.test(n)) return false;
  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(n[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(n[9]) && digito(10) === Number(n[10]);
}

export function cnpjValido(cnpj: string): boolean {
  const n = soNumeros(cnpj);
  if (n.length !== 14 || /^(\d)\1+$/.test(n)) return false;
  const digito = (ate: number) => {
    const pesos = ate === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, peso, i) => s + Number(n[i]) * peso, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(12) === Number(n[12]) && digito(13) === Number(n[13]);
}

function formatarCep(cep: string): string {
  const n = soNumeros(cep);
  return n.length === 8 ? `${n.slice(0, 5)}-${n.slice(5)}` : cep.trim();
}

// ---------------------------------------------------------------------------
// Dados que o formulário pede

export const PRAZO_ENTREGA_PADRAO = 30;
export const GARANTIA_PADRAO = 6;

const texto = (max: number) => z.string().trim().max(max, `No máximo ${max} caracteres.`);

export const dadosContratoSchema = z
  .object({
    empresaEmissora: z.enum(["LEGAUS", "IDEZZA"]),
    clienteTipo: z.enum(["PF", "PJ"]),
    clienteNome: texto(200).min(1, "Informe o nome do cliente."),
    clienteDocumento: texto(20),
    clienteEndereco: texto(300).min(1, "Informe o endereço."),
    clienteCidade: texto(100).min(1, "Informe a cidade."),
    clienteUf: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "UF com 2 letras."),
    clienteCep: texto(12),
    representanteNome: texto(200),
    representanteCpf: texto(20),
    produto: texto(3000).min(1, "Descreva o produto."),
    especificacoes: texto(5000),
    valorCentavos: z.number({ error: "Informe o valor." }).int().min(1, "Informe o valor."),
    formaPagamento: texto(1000).min(1, "Informe as condições de pagamento."),
    prazoEntregaDias: z
      .number({ error: "Informe o prazo em dias." })
      .int("Use um número inteiro de dias.")
      .min(1, "Prazo de pelo menos 1 dia.")
      .max(730, "Prazo de no máximo 730 dias."),
    garantiaMeses: z
      .number({ error: "Informe a garantia em meses." })
      .int("Use um número inteiro de meses.")
      .min(1, "Garantia de pelo menos 1 mês.")
      .max(120, "Garantia de no máximo 120 meses."),
    localInstalacao: texto(300),
  })
  .superRefine((d, ctx) => {
    const erro = (campo: string, message: string) => ctx.addIssue({ code: "custom", path: [campo], message });
    if (d.clienteTipo === "PF") {
      if (!d.clienteDocumento) erro("clienteDocumento", "Informe o CPF do cliente.");
      else if (!cpfValido(d.clienteDocumento)) erro("clienteDocumento", "CPF inválido — confira os números.");
      return;
    }
    if (!d.clienteDocumento) erro("clienteDocumento", "Informe o CNPJ do cliente.");
    else if (!cnpjValido(d.clienteDocumento)) erro("clienteDocumento", "CNPJ inválido — confira os números.");
    if (!d.representanteNome) erro("representanteNome", "Informe quem assina pela empresa.");
    if (!d.representanteCpf) erro("representanteCpf", "Informe o CPF de quem assina.");
    else if (!cpfValido(d.representanteCpf)) erro("representanteCpf", "CPF inválido — confira os números.");
  });

export type DadosContrato = z.infer<typeof dadosContratoSchema>;
export type CampoContrato = keyof DadosContrato;
export type ErrosContrato = Partial<Record<CampoContrato, string>>;

/** Primeiro erro de cada campo, pra mostrar embaixo do campo no formulário. */
export function errosPorCampo(issues: readonly { path: readonly PropertyKey[]; message: string }[]): ErrosContrato {
  const erros: ErrosContrato = {};
  for (const issue of issues) {
    const campo = String(issue.path[0] ?? "") as CampoContrato;
    if (campo && !erros[campo]) erros[campo] = issue.message;
  }
  return erros;
}

/** Dados guardados no contrato (JSON) → formulário; campo que falta volta vazio. */
export function lerDadosContrato(bruto: unknown): DadosContrato | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const o = bruto as Record<string, unknown>;
  const s = (k: CampoContrato) => (typeof o[k] === "string" ? (o[k] as string) : "");
  const n = (k: CampoContrato, padrao: number) => (typeof o[k] === "number" && Number.isFinite(o[k]) ? (o[k] as number) : padrao);
  return {
    empresaEmissora: o.empresaEmissora === "IDEZZA" ? "IDEZZA" : "LEGAUS",
    clienteTipo: o.clienteTipo === "PJ" ? "PJ" : "PF",
    clienteNome: s("clienteNome"),
    clienteDocumento: s("clienteDocumento"),
    clienteEndereco: s("clienteEndereco"),
    clienteCidade: s("clienteCidade"),
    clienteUf: s("clienteUf"),
    clienteCep: s("clienteCep"),
    representanteNome: s("representanteNome"),
    representanteCpf: s("representanteCpf"),
    produto: s("produto"),
    especificacoes: s("especificacoes"),
    valorCentavos: n("valorCentavos", 0),
    formaPagamento: s("formaPagamento"),
    prazoEntregaDias: n("prazoEntregaDias", PRAZO_ENTREGA_PADRAO),
    garantiaMeses: n("garantiaMeses", GARANTIA_PADRAO),
    localInstalacao: s("localInstalacao"),
  };
}

/** "15.800,00", "R$ 15800", "15800.5" → centavos; null se não der pra ler. */
export function lerValorEmReais(entrada: string): number | null {
  let t = entrada.replace(/R\$|\s/g, "");
  if (!t) return null;
  // Com vírgula, ela é a casa decimal e os pontos são de milhar; sem vírgula,
  // ponto seguido de 3 dígitos é milhar ("15.800") e o resto é decimal.
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

export function formatarValorEmReais(centavos: number): string {
  return centavos > 0 ? (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
}

// ---------------------------------------------------------------------------
// Dados → texto

const FALTANDO = "[não informado]";

function formatarData(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(data);
}

export type ExtrasContrato = {
  negocioTitulo: string;
  clienteTelefone: string | null;
  previsaoEntrega: Date | null;
  previsaoInstalacao: Date | null;
  hoje: Date;
};

function cidadeUf(cidade: string, uf: string): string {
  if (!cidade.trim()) return FALTANDO;
  return uf.trim() ? `${cidade.trim()}/${uf.trim().toUpperCase()}` : cidade.trim();
}

/** Qualificação do comprador, já do jeito certo pra pessoa física ou jurídica. */
export function qualificacaoCliente(d: DadosContrato): string {
  const ou = (v: string) => v.trim() || FALTANDO;
  const cep = d.clienteCep.trim() ? `, CEP ${formatarCep(d.clienteCep)}` : "";
  const local = `${ou(d.clienteEndereco)}, na cidade de ${cidadeUf(d.clienteCidade, d.clienteUf)}${cep}`;
  const documento = formatarDocumento(d.clienteDocumento) || FALTANDO;
  if (d.clienteTipo === "PJ") {
    return (
      `${ou(d.clienteNome)}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${documento}, sediada na ${local}, ` +
      `neste ato representada por ${ou(d.representanteNome)}, portador(a) do CPF nº ${formatarDocumento(d.representanteCpf) || FALTANDO}, ` +
      `doravante denominada simplesmente Comprador`
    );
  }
  return (
    `${ou(d.clienteNome)}, pessoa física, inscrita no CPF sob o nº ${documento}, residente e domiciliada na ${local}, ` +
    `doravante denominada simplesmente Comprador`
  );
}

/** Valor de cada {{campo}} do modelo (CAMPOS_MODELO_CONTRATO em lib/server/contratos.ts). */
export function valoresDoContrato(d: DadosContrato, empresa: DadosEmpresa, extras: ExtrasContrato): Record<string, string> {
  const ou = (v: string) => v.trim() || FALTANDO;
  const pj = d.clienteTipo === "PJ";
  const documento = formatarDocumento(d.clienteDocumento) || FALTANDO;
  const produto = d.produto
    .split("\n")
    .map((l) => l.trim().replace(/[.;]+$/, ""))
    .filter(Boolean)
    .join("; ");
  const especificacoes = d.especificacoes
    .split("\n")
    .map((l) => frase(l))
    .filter(Boolean)
    .join(" ");
  const valor = d.valorCentavos > 0 ? centavosParaReais(d.valorCentavos) : FALTANDO;
  const empresaCidadeUf = `${nomeProprio(empresa.cidade)}/${empresa.uf}`;

  return {
    cliente_qualificacao: qualificacaoCliente(d),
    cliente_nome: ou(d.clienteNome),
    cliente_razao_social: ou(d.clienteNome),
    cliente_documento: documento,
    cliente_cnpj: documento,
    cliente_endereco: ou(d.clienteEndereco),
    cliente_cidade_uf: cidadeUf(d.clienteCidade, d.clienteUf),
    cliente_telefone: extras.clienteTelefone || FALTANDO,
    cliente_representante_nome: pj ? ou(d.representanteNome) : ou(d.clienteNome),
    cliente_representante_cpf: pj ? formatarDocumento(d.representanteCpf) || FALTANDO : documento,
    negocio_titulo: extras.negocioTitulo,
    negocio_produto: produto || FALTANDO,
    negocio_descricao: especificacoes,
    especificacoes: especificacoes ? `Especificações: ${especificacoes}` : "",
    valor,
    valor_extenso: d.valorCentavos > 0 ? valorPorExtenso(d.valorCentavos) : FALTANDO,
    forma_pagamento: d.formaPagamento.trim() ? continuacaoDeFrase(d.formaPagamento) : "a combinar entre as partes",
    prazo_entrega: quantidadePorExtenso(d.prazoEntregaDias, "dia corrido", "dias corridos"),
    garantia: quantidadePorExtenso(d.garantiaMeses, "mês", "meses"),
    local_instalacao: d.localInstalacao.trim()
      ? `a ser realizada em ${d.localInstalacao.trim().replace(/[.;]+$/, "")}`
      : "a ser realizada no local indicado pelo Comprador",
    previsao_entrega: extras.previsaoEntrega ? formatarData(extras.previsaoEntrega) : "a combinar",
    previsao_instalacao: extras.previsaoInstalacao ? formatarData(extras.previsaoInstalacao) : "a combinar",
    data_hoje: formatarData(extras.hoje),
    empresa_razao_social: nomeProprio(empresa.razaoSocial),
    empresa_nome_fantasia: empresa.nomeFantasia,
    empresa_cnpj: empresa.cnpj,
    empresa_endereco: `${nomeProprio(empresa.endereco)}, ${nomeProprio(empresa.bairro)}`,
    empresa_cidade_uf: empresaCidadeUf,
    empresa_representante_nome: nomeProprio(empresa.representanteNome),
    empresa_representante_cpf: empresa.representanteCpf,
  };
}

/** Linhas embaixo de cada assinatura. */
export function assinaturaVendedor(empresa: DadosEmpresa): string[] {
  return [nomeProprio(empresa.razaoSocial), `Representante: ${nomeProprio(empresa.representanteNome)}`, `CPF nº ${empresa.representanteCpf}`];
}

export function assinaturaComprador(d: DadosContrato): string[] {
  const nome = d.clienteNome.trim() || "Comprador";
  if (d.clienteTipo === "PJ") {
    return [
      nome,
      ...(d.representanteNome.trim() ? [`Representante: ${d.representanteNome.trim()}`] : []),
      ...(d.representanteCpf.trim() ? [`CPF nº ${formatarDocumento(d.representanteCpf)}`] : []),
    ];
  }
  return [nome, ...(d.clienteDocumento.trim() ? [`CPF nº ${formatarDocumento(d.clienteDocumento)}`] : [])];
}

export const EMPRESA_CONTRATO_LABEL: Record<ChaveEmpresaEmissora, string> = { LEGAUS: "Legaus Kids", IDEZZA: "Idezza" };

// ---------------------------------------------------------------------------
// Modelo padrão

// Convertido do modelo real que a Legaus Kids já usa (contrato Legaus x Dom
// Quixote, 28/07/2026). Em 12/11/2026 passou pra maiúsculas só no começo das
// frases e nos nomes, ganhou a qualificação do comprador pessoa física ou
// jurídica, o valor por extenso e os prazos/garantia/local do formulário; o
// clausulado é o mesmo.
export const MODELO_PADRAO_CONTRATO = `Contrato particular de compra e venda

Do presente contrato participam as seguintes partes:

{{empresa_razao_social}}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº {{empresa_cnpj}}, sediada na {{empresa_endereco}}, na cidade de {{empresa_cidade_uf}}, doravante denominada simplesmente Vendedor, nestes autos representada pelo seu proprietário {{empresa_representante_nome}}, portador do CPF nº {{empresa_representante_cpf}}, residente e domiciliado na {{empresa_endereco}}, na cidade de {{empresa_cidade_uf}}.

{{cliente_qualificacao}}.

1 - Dos termos do presente contrato:

1.1) Objeto: O Vendedor compromete-se a realizar a tradição do seguinte bem: {{negocio_produto}}, conforme modelo e especificações apresentados e aprovados pelo Comprador. {{especificacoes}} Para isso, o Comprador se compromete a repassar o valor global de {{valor}} ({{valor_extenso}}), nos termos da cláusula 1.2.

1.2) Preço e forma de pagamento: O Comprador compromete-se a realizar o adimplemento da soma de {{valor}} ({{valor_extenso}}), {{forma_pagamento}}.

1.3) Prazo de entrega: O prazo de entrega é de até {{prazo_entrega}}, contados da confirmação do pagamento da entrada e da aprovação do projeto. Este prazo poderá ser prorrogado, sem aplicação de penalidades à {{empresa_nome_fantasia}}, em casos de atraso no fornecimento de materiais por terceiros, indisponibilidade de insumos, problemas logísticos, greves, eventos climáticos ou quaisquer outras situações de caso fortuito ou força maior que impactem a fabricação ou a entrega do produto, comprometendo-se a {{empresa_nome_fantasia}} a manter o Comprador informado sobre eventual alteração.

1.4) Início da produção: O Vendedor somente dará início à produção do brinquedo após o adimplemento integral e a devida compensação do valor de {{valor}}, conforme os termos da cláusula 1.2.

1.5) Montagem e instalação: A montagem do brinquedo, {{local_instalacao}}, será de exclusiva responsabilidade do Vendedor, cabendo a este também a devida instalação e avaliação de segurança do equipamento antes da liberação para uso.

1.6) Garantia: O Comprador terá direito ao prazo de {{garantia}} de garantia sobre o produto para quaisquer defeitos de fabricação, excetuando-se os desgastes naturais decorrentes do uso regular.

2 - Da mora e do inadimplemento:

2.1) Encargos moratórios: Em caso de mora do Comprador, sobre o saldo devedor passará a incidir juros moratórios de 1% (um por cento) ao mês, bem como correção monetária pelo índice IGP-M (FGV), acrescidos de multa moratória de 2% (dois por cento).

2.2) Inadimplemento do Vendedor: O inadimplemento do Vendedor acarretará a rescisão automática deste instrumento, devendo este restituir integralmente os valores já adimplidos pelo Comprador, devidamente corrigidos, sem qualquer direito de retenção.

2.3) Inadimplemento do Comprador: A ausência de pagamento por parte do Comprador por mais de 7 (sete) dias consecutivos gerará a presunção de inadimplemento injustificado, autorizando a rescisão automática do contrato. Ocorrendo a rescisão, as partes retornarão ao status quo ante, devendo o Comprador providenciar, às suas expensas, a devolução dos bens à propriedade do Vendedor. Este procederá à restituição das verbas pagas pelo Comprador, sendo permitida a retenção penal no limite de até 10% (dez por cento) do valor efetivamente pago até o momento.

3 - Da sucessão:

3.1) No caso de falecimento, extinção, translado, falência ou qualquer outro meio de extinção ou limitação dos direitos das partes, subsiste o presente contrato, de modo que os sucessores e herdeiros ficam obrigados ao cumprimento integral de todas as cláusulas deste instrumento, nos limites das forças da herança ou do patrimônio líquido transferido.

4 - Do foro:

4.1) Os contratantes elegem, de comum acordo, o foro da comarca de {{empresa_cidade_uf}} para dirimir qualquer dúvida, controvérsia ou conflito decorrente da interpretação ou execução deste contrato, renunciando expressamente a qualquer outro, por mais privilegiado que seja.

5 - Do consentimento:

5.1) E, por estarem justos, cientes e de pleno acordo com todas as cláusulas e condições estipuladas, assinam o presente instrumento em duas vias de igual teor e forma, na presença das testemunhas abaixo qualificadas.

{{empresa_cidade_uf}}, {{data_hoje}}.`;
