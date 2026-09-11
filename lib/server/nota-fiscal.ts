import "server-only";
import { prisma } from "@/lib/db";
import { emitirNfe, consultarNfe, baixarArquivoFocusNfe, focusNfeConfigurado, type ItemNfe } from "@/lib/server/focus-nfe";

export { focusNfeConfigurado };

export type ItemNotaFiscalInput = {
  nome: string;
  descricao: string;
  quantidade: number;
  valorUnitarioCentavos: number;
  ncm: string;
  cfop: string;
  unidade: string;
  icmsSituacaoTributaria: string;
};

/** Pré-preenche a partir dos dados que já existem no negócio — o resto (NCM/CFOP/CST) fica em branco de propósito, ver focus-nfe.ts. */
export async function prepararItemPadrao(negocioId: string): Promise<ItemNotaFiscalInput> {
  const negocio = await prisma.negocio.findUniqueOrThrow({ where: { id: negocioId } });
  return {
    nome: negocio.produto || negocio.titulo,
    descricao: negocio.descricao || negocio.produto || negocio.titulo,
    quantidade: 1,
    valorUnitarioCentavos: negocio.valorCentavos,
    ncm: "",
    cfop: "",
    unidade: "UN",
    icmsSituacaoTributaria: "",
  };
}

export function listNotasFiscaisPorNegocio(negocioId: string) {
  return prisma.notaFiscal.findMany({ where: { negocioId }, orderBy: { criadaEm: "desc" } });
}

function gerarReferencia(negocioId: string): string {
  return `legaus-${negocioId}-${Date.now()}`;
}

/**
 * Cria a NotaFiscal (status NAO_EMITIDA) e, se a Focus NFe estiver
 * configurada, já tenta emitir na sequência. Se não estiver configurada,
 * fica só com o registro pra conferência — quem chama decide como avisar
 * o usuário (ver app/(app)/negocios/actions.ts).
 */
export async function criarEEmitirNotaFiscal(input: {
  negocioId: string;
  criadaPorId: string;
  itens: ItemNotaFiscalInput[];
}) {
  const negocio = await prisma.negocio.findUniqueOrThrow({ where: { id: input.negocioId }, include: { contato: true } });
  const valorTotalCentavos = input.itens.reduce((soma, i) => soma + i.quantidade * i.valorUnitarioCentavos, 0);
  const referencia = gerarReferencia(input.negocioId);

  const notaFiscal = await prisma.notaFiscal.create({
    data: {
      negocioId: input.negocioId,
      referencia,
      status: "NAO_EMITIDA",
      itensJson: input.itens,
      valorTotalCentavos,
      criadaPorId: input.criadaPorId,
    },
  });

  if (!focusNfeConfigurado()) {
    return notaFiscal;
  }

  if (!negocio.contato) {
    throw new Error("Esse negócio não tem cliente vinculado — não dá pra emitir nota fiscal sem destinatário.");
  }
  if (!negocio.contato.cnpj && !negocio.contato.representanteLegalCpf) {
    throw new Error("Cadastre o CNPJ (ou CPF do representante) do cliente antes de emitir a nota fiscal.");
  }

  return emitirEAtualizar(notaFiscal.id, {
    nome: negocio.contato.razaoSocial || negocio.contato.nome,
    cnpj: negocio.contato.cnpj || undefined,
    cpf: !negocio.contato.cnpj ? negocio.contato.representanteLegalCpf || undefined : undefined,
    logradouro: negocio.contato.endereco || undefined,
    numero: "S/N",
    bairro: undefined,
    municipio: negocio.contato.cidade || undefined,
    uf: negocio.contato.uf || undefined,
    cep: negocio.contato.cep || undefined,
  }, input.itens, referencia);
}

async function emitirEAtualizar(
  notaFiscalId: string,
  destinatario: Parameters<typeof emitirNfe>[1],
  itens: ItemNotaFiscalInput[],
  referencia: string,
) {
  const itensFocus: ItemNfe[] = itens.map((i, idx) => ({
    numero_item: idx + 1,
    codigo_produto: String(idx + 1).padStart(6, "0"),
    descricao: i.descricao,
    cfop: i.cfop,
    quantidade_comercial: i.quantidade,
    valor_unitario_comercial: i.valorUnitarioCentavos / 100,
    valor_bruto: (i.quantidade * i.valorUnitarioCentavos) / 100,
    codigo_ncm: i.ncm,
    unidade_comercial: i.unidade,
    icms_situacao_tributaria: i.icmsSituacaoTributaria,
  }));

  try {
    const resposta = await emitirNfe(referencia, destinatario, itensFocus);
    return prisma.notaFiscal.update({
      where: { id: notaFiscalId },
      data: {
        status: resposta.status === "autorizado" ? "AUTORIZADA" : "PROCESSANDO",
        statusSefaz: resposta.status_sefaz,
        mensagemSefaz: resposta.mensagem_sefaz,
        numero: resposta.numero,
        serie: resposta.serie,
        chaveAcesso: resposta.chave_nfe,
      },
    });
  } catch (erro) {
    return prisma.notaFiscal.update({
      where: { id: notaFiscalId },
      data: { status: "REJEITADA", motivoRejeicao: erro instanceof Error ? erro.message : "Erro desconhecido ao emitir." },
    });
  }
}

/** Consulta o status atual na Focus NFe e atualiza o registro local — usado tanto pra acompanhar uma emissão "processando" quanto pra reconferir depois. */
export async function atualizarStatusNotaFiscal(notaFiscalId: string) {
  const notaFiscal = await prisma.notaFiscal.findUniqueOrThrow({ where: { id: notaFiscalId } });
  const resposta = await consultarNfe(notaFiscal.referencia);

  const statusMap: Record<string, "PROCESSANDO" | "AUTORIZADA" | "REJEITADA" | "CANCELADA"> = {
    processando_autorizacao: "PROCESSANDO",
    autorizado: "AUTORIZADA",
    erro_autorizacao: "REJEITADA",
    cancelado: "CANCELADA",
  };

  const [xmlBytes, danfeBytes] = await Promise.all([
    resposta.caminho_xml_nota_fiscal ? baixarArquivoFocusNfe(resposta.caminho_xml_nota_fiscal).catch(() => undefined) : undefined,
    resposta.caminho_danfe ? baixarArquivoFocusNfe(resposta.caminho_danfe).catch(() => undefined) : undefined,
  ]);

  return prisma.notaFiscal.update({
    where: { id: notaFiscalId },
    data: {
      status: statusMap[resposta.status] ?? notaFiscal.status,
      statusSefaz: resposta.status_sefaz,
      mensagemSefaz: resposta.mensagem_sefaz,
      motivoRejeicao: resposta.erros?.[0]?.mensagem,
      numero: resposta.numero,
      serie: resposta.serie,
      chaveAcesso: resposta.chave_nfe,
      xmlBytes: xmlBytes ? new Uint8Array(xmlBytes) : undefined,
      danfeBytes: danfeBytes ? new Uint8Array(danfeBytes) : undefined,
    },
  });
}

/** Tenta emitir uma nota que ficou NAO_EMITIDA (criada antes da Focus NFe estar configurada, ou que falhou por dado faltando no cliente) — reusa os itens já salvos, sem duplicar o registro. */
export async function tentarEmitirNotaFiscal(notaFiscalId: string) {
  const notaFiscal = await prisma.notaFiscal.findUniqueOrThrow({ where: { id: notaFiscalId }, include: { negocio: { include: { contato: true } } } });
  const negocio = notaFiscal.negocio;
  if (!negocio.contato) throw new Error("Esse negócio não tem cliente vinculado.");
  if (!negocio.contato.cnpj && !negocio.contato.representanteLegalCpf) {
    throw new Error("Cadastre o CNPJ (ou CPF do representante) do cliente antes de emitir a nota fiscal.");
  }
  const itens = notaFiscal.itensJson as unknown as ItemNotaFiscalInput[];
  return emitirEAtualizar(notaFiscal.id, {
    nome: negocio.contato.razaoSocial || negocio.contato.nome,
    cnpj: negocio.contato.cnpj || undefined,
    cpf: !negocio.contato.cnpj ? negocio.contato.representanteLegalCpf || undefined : undefined,
    logradouro: negocio.contato.endereco || undefined,
    numero: "S/N",
    bairro: undefined,
    municipio: negocio.contato.cidade || undefined,
    uf: negocio.contato.uf || undefined,
    cep: negocio.contato.cep || undefined,
  }, itens, notaFiscal.referencia);
}

/** Reemitir depois de corrigir os dados — mesma referência não pode ser reusada na Focus NFe após rejeição de verdade, então gera uma nova. */
export async function reemitirNotaFiscal(notaFiscalIdAnterior: string, itens: ItemNotaFiscalInput[]) {
  const anterior = await prisma.notaFiscal.findUniqueOrThrow({ where: { id: notaFiscalIdAnterior } });
  return criarEEmitirNotaFiscal({ negocioId: anterior.negocioId, criadaPorId: anterior.criadaPorId, itens });
}
