import "server-only";
import { prisma } from "@/lib/db";
import { emitirNfe, consultarNfe, baixarArquivoFocusNfe, focusNfeConfigurado, type ItemNfe, type DestinatarioNfe } from "@/lib/server/focus-nfe";

export { focusNfeConfigurado };

export type ItemNotaFiscalInput = {
  descricao: string;
  quantidade: number;
  valorUnitarioCentavos: number;
  ncm: string;
  cfop: string;
  unidade: string;
  icmsSituacaoTributaria: string;
};

/** Clientes pro seletor da aba Notas Fiscais — qualquer contato pode ser destinatário, não só os marcados como "Cliente". */
export function listContatosParaNotaFiscal() {
  return prisma.contato.findMany({
    select: { id: true, nome: true, cnpj: true, representanteLegalCpf: true },
    orderBy: { nome: "asc" },
  });
}

/**
 * Todos os negócios/orçamentos (não filtrado por cliente) — carregados de
 * uma vez pro seletor da aba Notas Fiscais, que filtra por cliente no
 * próprio navegador (mesmo padrão já usado em listarNegociosParaSeletor/
 * listNegociosParaConciliacao, sem busca paginada porque o volume é
 * pequeno pra esse porte de negócio).
 */
export function listNegociosParaNotaFiscal() {
  return prisma.negocio.findMany({
    select: { id: true, contatoId: true, titulo: true, produto: true, descricao: true, valorCentavos: true },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });
}

export function listOrcamentosParaNotaFiscal() {
  return prisma.orcamento.findMany({
    select: {
      id: true,
      contatoId: true,
      numero: true,
      descontoCentavos: true,
      itens: { select: { nome: true, descricao: true, quantidade: true, valorUnitarioCentavos: true }, orderBy: { ordem: "asc" } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
}

export function listNotasFiscais() {
  return prisma.notaFiscal.findMany({
    include: { contato: true, negocio: { select: { titulo: true } }, orcamento: { select: { numero: true } } },
    orderBy: { criadaEm: "desc" },
  });
}

function gerarReferencia(contatoId: string): string {
  return `legaus-${contatoId}-${Date.now()}`;
}

function montarDestinatario(contato: {
  nome: string;
  razaoSocial: string | null;
  cnpj: string | null;
  representanteLegalCpf: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
}): DestinatarioNfe {
  return {
    nome: contato.razaoSocial || contato.nome,
    cnpj: contato.cnpj || undefined,
    cpf: !contato.cnpj ? contato.representanteLegalCpf || undefined : undefined,
    logradouro: contato.endereco || undefined,
    numero: "S/N",
    bairro: undefined,
    municipio: contato.cidade || undefined,
    uf: contato.uf || undefined,
    cep: contato.cep || undefined,
  };
}

/**
 * Cria a NotaFiscal (status NAO_EMITIDA) e, se a Focus NFe estiver
 * configurada, já tenta emitir na sequência. Se não estiver configurada,
 * fica só com o registro pra conferência — quem chama decide como avisar
 * o usuário (ver app/(app)/financeiro/actions.ts).
 */
export async function criarEEmitirNotaFiscal(input: {
  contatoId: string;
  negocioId?: string;
  orcamentoId?: string;
  criadaPorId: string;
  itens: ItemNotaFiscalInput[];
}) {
  const contato = await prisma.contato.findUniqueOrThrow({ where: { id: input.contatoId } });
  const valorTotalCentavos = input.itens.reduce((soma, i) => soma + i.quantidade * i.valorUnitarioCentavos, 0);
  const referencia = gerarReferencia(input.contatoId);

  const notaFiscal = await prisma.notaFiscal.create({
    data: {
      contatoId: input.contatoId,
      negocioId: input.negocioId,
      orcamentoId: input.orcamentoId,
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
  if (!contato.cnpj && !contato.representanteLegalCpf) {
    throw new Error("Cadastre o CNPJ (ou CPF do representante) do cliente antes de emitir a nota fiscal.");
  }

  return emitirEAtualizar(notaFiscal.id, montarDestinatario(contato), input.itens, referencia);
}

async function emitirEAtualizar(notaFiscalId: string, destinatario: DestinatarioNfe, itens: ItemNotaFiscalInput[], referencia: string) {
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
  const notaFiscal = await prisma.notaFiscal.findUniqueOrThrow({ where: { id: notaFiscalId }, include: { contato: true } });
  if (!notaFiscal.contato.cnpj && !notaFiscal.contato.representanteLegalCpf) {
    throw new Error("Cadastre o CNPJ (ou CPF do representante) do cliente antes de emitir a nota fiscal.");
  }
  const itens = notaFiscal.itensJson as unknown as ItemNotaFiscalInput[];
  return emitirEAtualizar(notaFiscal.id, montarDestinatario(notaFiscal.contato), itens, notaFiscal.referencia);
}

/** Reemitir depois de corrigir os dados — mesma referência não pode ser reusada na Focus NFe após rejeição de verdade, então gera uma nova. */
export async function reemitirNotaFiscal(notaFiscalIdAnterior: string, itens: ItemNotaFiscalInput[]) {
  const anterior = await prisma.notaFiscal.findUniqueOrThrow({ where: { id: notaFiscalIdAnterior } });
  return criarEEmitirNotaFiscal({
    contatoId: anterior.contatoId,
    negocioId: anterior.negocioId ?? undefined,
    orcamentoId: anterior.orcamentoId ?? undefined,
    criadaPorId: anterior.criadaPorId,
    itens,
  });
}
