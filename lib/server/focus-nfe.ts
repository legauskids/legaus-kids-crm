import "server-only";

// Cliente da API da Focus NFe (https://doc.focusnfe.com.br/) — emissão de
// NF-e. Documentação consultada em 2026-09-10 (endpoints, autenticação,
// formato de payload e de resposta); nunca testado contra a API de
// verdade porque depende de conta na Focus NFe + certificado digital
// e-CNPJ A1, que só o Marcos pode providenciar (ver .env.example).

const BASE_HOMOLOGACAO = "https://homologacao.focusnfe.com.br/v2";
const BASE_PRODUCAO = "https://api.focusnfe.com.br/v2";

function baseUrl(): string {
  return process.env.FOCUS_NFE_AMBIENTE === "producao" ? BASE_PRODUCAO : BASE_HOMOLOGACAO;
}

/** Lista os campos que faltam configurar — usado pra dar um erro único e claro em vez de falhar aos poucos. */
export function camposFocusNfeFaltando(): string[] {
  const obrigatorios = [
    "FOCUS_NFE_API_TOKEN",
    "EMPRESA_CNPJ",
    "EMPRESA_RAZAO_SOCIAL",
    "EMPRESA_INSCRICAO_ESTADUAL",
    "EMPRESA_REGIME_TRIBUTARIO",
    "EMPRESA_LOGRADOURO",
    "EMPRESA_NUMERO",
    "EMPRESA_BAIRRO",
    "EMPRESA_MUNICIPIO",
    "EMPRESA_UF",
    "EMPRESA_CEP",
  ];
  return obrigatorios.filter((chave) => !process.env[chave]);
}

export function focusNfeConfigurado(): boolean {
  return camposFocusNfeFaltando().length === 0;
}

function autenticacao(): string {
  const token = process.env.FOCUS_NFE_API_TOKEN ?? "";
  return `Basic ${Buffer.from(`${token}:`).toString("base64")}`;
}

export type ItemNfe = {
  numero_item: number;
  codigo_produto: string;
  descricao: string;
  cfop: string;
  quantidade_comercial: number;
  valor_unitario_comercial: number;
  valor_bruto: number;
  codigo_ncm: string;
  unidade_comercial: string;
  icms_situacao_tributaria: string;
};

export type DestinatarioNfe = {
  nome: string;
  cnpj?: string;
  cpf?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
};

/** Monta o corpo do POST /nfe a partir dos dados do emitente (env) + destinatário/itens (vêm do negócio, conferidos na tela antes de emitir). */
function montarPayload(destinatario: DestinatarioNfe, itens: ItemNfe[]) {
  return {
    natureza_operacao: "Venda de mercadoria",
    data_emissao: new Date().toISOString(),
    tipo_documento: 1, // saída
    finalidade_emissao: 1, // normal
    cnpj_emitente: process.env.EMPRESA_CNPJ,
    nome_emitente: process.env.EMPRESA_RAZAO_SOCIAL,
    nome_fantasia_emitente: process.env.EMPRESA_NOME_FANTASIA || process.env.EMPRESA_RAZAO_SOCIAL,
    logradouro_emitente: process.env.EMPRESA_LOGRADOURO,
    numero_emitente: process.env.EMPRESA_NUMERO,
    bairro_emitente: process.env.EMPRESA_BAIRRO,
    municipio_emitente: process.env.EMPRESA_MUNICIPIO,
    uf_emitente: process.env.EMPRESA_UF,
    cep_emitente: process.env.EMPRESA_CEP,
    inscricao_estadual_emitente: process.env.EMPRESA_INSCRICAO_ESTADUAL,
    regime_tributario_emitente: Number(process.env.EMPRESA_REGIME_TRIBUTARIO),

    nome_destinatario: destinatario.nome,
    cnpj_destinatario: destinatario.cnpj || undefined,
    cpf_destinatario: !destinatario.cnpj ? destinatario.cpf : undefined,
    logradouro_destinatario: destinatario.logradouro,
    numero_destinatario: destinatario.numero,
    bairro_destinatario: destinatario.bairro,
    municipio_destinatario: destinatario.municipio,
    uf_destinatario: destinatario.uf,
    cep_destinatario: destinatario.cep,
    indicador_inscricao_estadual_destinatario: 9, // 9 = não contribuinte — ajuste se o cliente informar IE

    items: itens,
  };
}

export type RespostaFocusNfe = {
  status: "processando_autorizacao" | "autorizado" | "erro_autorizacao" | "cancelado";
  status_sefaz?: string;
  mensagem_sefaz?: string;
  chave_nfe?: string;
  numero?: string;
  serie?: string;
  caminho_xml_nota_fiscal?: string;
  caminho_danfe?: string;
  erros?: { mensagem: string; campo?: string }[];
};

/** POST /nfe?ref=... — emissão é assíncrona: a resposta imediata normalmente vem "processando_autorizacao", ver consultarNfe pra saber o resultado final. */
export async function emitirNfe(referencia: string, destinatario: DestinatarioNfe, itens: ItemNfe[]): Promise<RespostaFocusNfe> {
  const faltando = camposFocusNfeFaltando();
  if (faltando.length > 0) {
    throw new Error(`Emissão de nota fiscal não configurada — falta(m): ${faltando.join(", ")} no ambiente.`);
  }

  const resposta = await fetch(`${baseUrl()}/nfe?ref=${encodeURIComponent(referencia)}`, {
    method: "POST",
    headers: { Authorization: autenticacao(), "Content-Type": "application/json" },
    body: JSON.stringify(montarPayload(destinatario, itens)),
  });

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok && resposta.status !== 202) {
    throw new Error(dados?.erros?.[0]?.mensagem || dados?.mensagem || `Erro HTTP ${resposta.status} ao emitir nota fiscal.`);
  }
  return dados as RespostaFocusNfe;
}

/** GET /nfe/{ref}?completa=1 — consulta o resultado de uma emissão assíncrona (ou o estado atual de uma nota já emitida). */
export async function consultarNfe(referencia: string): Promise<RespostaFocusNfe> {
  if (!focusNfeConfigurado()) {
    throw new Error("Emissão de nota fiscal não configurada.");
  }
  const resposta = await fetch(`${baseUrl()}/nfe/${encodeURIComponent(referencia)}?completa=1`, {
    headers: { Authorization: autenticacao() },
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw new Error(dados?.mensagem || `Erro HTTP ${resposta.status} ao consultar nota fiscal.`);
  }
  return dados as RespostaFocusNfe;
}

/** Baixa XML/DANFE — os "caminho_*" da resposta da Focus NFe já vêm como URL completa. */
export async function baixarArquivoFocusNfe(url: string): Promise<Buffer> {
  const resposta = await fetch(url, { headers: { Authorization: autenticacao() } });
  if (!resposta.ok) throw new Error(`Erro HTTP ${resposta.status} ao baixar arquivo da nota fiscal.`);
  return Buffer.from(await resposta.arrayBuffer());
}
