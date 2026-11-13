import "server-only";
import { prisma } from "@/lib/db";
import { EMPRESAS_EMISSORAS, type ChaveEmpresaEmissora } from "@/lib/constants/empresa";
import { normalizarTelefone } from "@/lib/server/contatos";
import { formatarDocumento } from "@/lib/utils/busca-cliente";
import {
  GARANTIA_PADRAO,
  MODELO_PADRAO_CONTRATO,
  PRAZO_ENTREGA_PADRAO,
  dadosContratoSchema,
  errosPorCampo,
  mesclarModelo,
  nomeProprio,
  normalizarQuebras,
  valoresDoContrato,
  type DadosContrato,
  type ErrosContrato,
} from "@/lib/utils/contrato";
import type { Prisma, StatusContrato } from "@prisma/client";

// Derivado do client de verdade (com a extensão de soft-delete de Negocio
// aplicada em lib/db.ts) em vez de Prisma.TransactionClient genérico — os
// dois tipos divergem depois de um $extends.
type Cliente = Parameters<Parameters<typeof prisma.$transaction>[0]>[0] | typeof prisma;

export const CAMPOS_MODELO_CONTRATO = [
  { chave: "cliente_qualificacao", descricao: "Comprador por extenso (nome, CPF ou CNPJ, endereço, quem assina) — já certo pra pessoa física ou jurídica" },
  { chave: "cliente_nome", descricao: "Nome do cliente (pessoa física) ou razão social (empresa)" },
  { chave: "cliente_documento", descricao: "CPF ou CNPJ do cliente" },
  { chave: "cliente_endereco", descricao: "Endereço do cliente" },
  { chave: "cliente_cidade_uf", descricao: "Cidade/UF do cliente" },
  { chave: "cliente_telefone", descricao: "Telefone do cliente" },
  { chave: "cliente_representante_nome", descricao: "Quem assina pelo cliente" },
  { chave: "cliente_representante_cpf", descricao: "CPF de quem assina pelo cliente" },
  { chave: "negocio_produto", descricao: "Produto (objeto do contrato)" },
  { chave: "especificacoes", descricao: "\"Especificações: ...\" (some se ficar em branco)" },
  { chave: "valor", descricao: "Valor total, já formatado em R$" },
  { chave: "valor_extenso", descricao: "Valor total por extenso" },
  { chave: "forma_pagamento", descricao: "Condições de pagamento" },
  { chave: "prazo_entrega", descricao: "Prazo de entrega (ex: 30 (trinta) dias corridos)" },
  { chave: "garantia", descricao: "Garantia (ex: 6 (seis) meses)" },
  { chave: "local_instalacao", descricao: "Onde vai ser instalado" },
  { chave: "negocio_titulo", descricao: "Título do negócio" },
  { chave: "previsao_entrega", descricao: "Previsão de fechamento/entrega do negócio" },
  { chave: "previsao_instalacao", descricao: "Previsão de instalação do negócio" },
  { chave: "data_hoje", descricao: "Data de hoje" },
  { chave: "empresa_razao_social", descricao: "Razão social de quem vende (Legaus Kids ou Idezza)" },
  { chave: "empresa_nome_fantasia", descricao: "Nome fantasia de quem vende" },
  { chave: "empresa_cnpj", descricao: "CNPJ de quem vende" },
  { chave: "empresa_endereco", descricao: "Endereço de quem vende" },
  { chave: "empresa_cidade_uf", descricao: "Cidade/UF de quem vende" },
  { chave: "empresa_representante_nome", descricao: "Quem assina por quem vende" },
  { chave: "empresa_representante_cpf", descricao: "CPF de quem assina por quem vende" },
] as const;

// Modelo padrão até 11/11/2026 — o mesmo que estava salvo no banco, nunca
// personalizado. getModeloContratoAtivo troca ele pelo padrão novo
// (MODELO_PADRAO_CONTRATO); um modelo editado de verdade fica como está.
const MODELO_PADRAO_ATE_2026_11 = `CONTRATO PARTICULAR DE COMPRA E VENDA

Do presente contrato participam as seguintes partes:

{{empresa_razao_social}}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº {{empresa_cnpj}}, sediada na {{empresa_endereco}}, na cidade de {{empresa_cidade_uf}}, doravante denominada simplesmente VENDEDOR, nestes autos representada pelo seu proprietário {{empresa_representante_nome}}, portador do CPF nº {{empresa_representante_cpf}}, residente e domiciliado na {{empresa_endereco}}, na cidade de {{empresa_cidade_uf}}.

{{cliente_razao_social}}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº {{cliente_cnpj}}, sediada na {{cliente_endereco}}, {{cliente_cidade_uf}}, doravante denominada simplesmente COMPRADOR, neste ato representada por {{cliente_representante_nome}}, portador(a) do CPF nº {{cliente_representante_cpf}}.

1 - DOS TERMOS DO PRESENTE CONTRATO:

1.1) Objeto: O VENDEDOR compromete-se a realizar a tradição do seguinte bem: {{negocio_produto}}, conforme modelo e especificações apresentados e aprovados pelo cliente, referente ao negócio "{{negocio_titulo}}". {{negocio_descricao}} Para isso, o COMPRADOR se compromete a repassar o valor global de {{valor}}, nos termos da cláusula 1.2.

1.2) Preço e Forma de Pagamento: O COMPRADOR compromete-se a realizar o adimplemento da soma de {{valor}}, {{forma_pagamento}}.

1.3) Prazo de Entrega: O prazo de entrega é de até 30 (trinta) dias corridos, contados da confirmação do pagamento da entrada e da aprovação do projeto. Este prazo poderá ser prorrogado, sem aplicação de penalidades à {{empresa_nome_fantasia}}, em casos de atraso no fornecimento de materiais por terceiros, indisponibilidade de insumos, problemas logísticos, greves, eventos climáticos ou quaisquer outras situações de caso fortuito ou força maior que impactem a fabricação ou a entrega do produto, comprometendo-se a {{empresa_nome_fantasia}} a manter o cliente informado sobre eventual alteração.

1.4) Início da Produção: O VENDEDOR somente dará início à produção do brinquedo após o adimplemento integral e a devida compensação do valor de {{valor}}, conforme os termos da cláusula 1.2.

1.5) Montagem e Instalação: A montagem do brinquedo será de exclusiva responsabilidade do VENDEDOR, cabendo a este também a devida instalação e avaliação de segurança do equipamento antes da liberação para uso.

1.6) Garantia: O COMPRADOR terá direito ao prazo de 6 (seis) meses de garantia sobre o produto para quaisquer defeitos de fabricação, excetuando-se os desgastes naturais decorrentes do uso regular.

2 - DA MORA E DO INADIMPLEMENTO:

2.1) Encargos Moratórios: Em caso de mora do COMPRADOR, sobre o saldo devedor passará a incidir juros moratórios de 1% (um por cento) ao mês, bem como correção monetária pelo índice IGP-M (FGV), acrescidos de multa moratória de 2% (dois por cento).

2.2) Inadimplemento do VENDEDOR: O inadimplemento do VENDEDOR acarretará a rescisão automática deste instrumento, devendo este restituir integralmente os valores já adimplidos pelo COMPRADOR, devidamente corrigidos, sem qualquer direito de retenção.

2.3) Inadimplemento do COMPRADOR: A ausência de pagamento por parte do COMPRADOR por mais de 7 (sete) dias consecutivos gerará a presunção de inadimplemento injustificado, autorizando a rescisão automática do contrato. Ocorrendo a rescisão, as partes retornarão ao status quo ante, devendo o COMPRADOR providenciar, às suas expensas, a devolução dos bens à propriedade do VENDEDOR. Este procederá à restituição das verbas pagas pelo COMPRADOR, sendo permitida a retenção penal no limite de até 10% (dez por cento) do valor efetivamente PAGO até o momento.

3 - DA SUCESSÃO:

3.1) No caso de falecimento, extinção, translado, falência ou qualquer outro meio de extinção ou limitação dos direitos das partes, subsiste o presente contrato, de modo que os sucessores e herdeiros ficam obrigados ao cumprimento integral de todas as cláusulas deste instrumento, nos limites das forças da herança ou do patrimônio líquido transferido.

4 - DO FORO:

4.1) Os contratantes elegem, de comum acordo, o foro da comarca de {{empresa_cidade_uf}} para dirimir qualquer dúvida, controvérsia ou conflito decorrente da interpretação ou execução deste contrato, renunciando expressamente a qualquer outro, por mais privilegiado que seja.

5 - DO CONSENTIMENTO:

5.1) E, por estarem justos, cientes e de pleno acordo com todas as cláusulas e condições estipuladas, assinam o presente instrumento em duas vias de igual teor e forma, na presença das testemunhas abaixo qualificadas.

{{empresa_cidade_uf}}, {{data_hoje}}.`;

/** Sempre existe um só modelo "ativo" — cria o padrão na primeira vez que alguém acessa. */
export async function getModeloContratoAtivo(cliente: Cliente = prisma) {
  const existente = await cliente.modeloContrato.findFirst({ orderBy: { criadoEm: "asc" } });
  if (!existente) return cliente.modeloContrato.create({ data: { conteudo: MODELO_PADRAO_CONTRATO } });
  if (normalizarQuebras(existente.conteudo).trim() === MODELO_PADRAO_ATE_2026_11) {
    return cliente.modeloContrato.update({ where: { id: existente.id }, data: { conteudo: MODELO_PADRAO_CONTRATO } });
  }
  return existente;
}

export async function salvarModeloContrato(conteudo: string) {
  const atual = await getModeloContratoAtivo();
  return prisma.modeloContrato.update({ where: { id: atual.id }, data: { conteudo: normalizarQuebras(conteudo).trim() } });
}

/**
 * Confere se o negócio tem os dados mínimos pro contrato antes de deixar
 * marcar como Ganho por fora do formulário (arrastando no quadro, pelo
 * agente) — evita fechar negócio e só descobrir depois que falta documento,
 * endereço ou forma de pagamento. Pessoa física (sem CNPJ) precisa do CPF;
 * empresa, do CNPJ e de quem assina. Retorna o que falta (vazio = tudo certo).
 */
export async function validarDadosParaContrato(negocioId: string, cliente: Cliente = prisma): Promise<string[]> {
  const negocio = await cliente.negocio.findUnique({ where: { id: negocioId }, include: { contato: true } });
  if (!negocio) return ["Negócio não encontrado"];

  const faltando: string[] = [];
  const c = negocio.contato;
  if (!c) {
    faltando.push("Cliente vinculado ao negócio");
  } else {
    if (!c.endereco) faltando.push("Endereço do cliente");
    if (!c.cidade || !c.uf) faltando.push("Cidade/UF do cliente");
    if (c.cnpj) {
      if (!c.representanteLegalNome) faltando.push("Nome do representante legal do cliente");
      if (!c.representanteLegalCpf) faltando.push("CPF do representante legal do cliente");
    } else if (!c.representanteLegalCpf) {
      faltando.push("CPF do cliente (ou o CNPJ, se for empresa)");
    }
  }
  if (!negocio.formaPagamento) faltando.push("Forma de pagamento (na aba Dados do negócio)");

  return faltando;
}

/** Orçamento mais recente do cliente (aprovado antes de enviado, enviado antes de rascunho). */
async function ultimoOrcamentoDoCliente(contatoId: string, cliente: Cliente) {
  const orcamentos = await cliente.orcamento.findMany({
    where: { contatoId, status: { in: ["APROVADO", "ENVIADO", "RASCUNHO"] } },
    include: { itens: { orderBy: { ordem: "asc" } } },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
  const prioridade: Record<string, number> = { APROVADO: 0, ENVIADO: 1, RASCUNHO: 2 };
  return orcamentos.filter((o) => o.itens.length > 0).sort((a, b) => prioridade[a.status] - prioridade[b.status])[0] ?? null;
}

/**
 * Formulário do contrato já preenchido com o que o CRM sabe: cadastro do
 * cliente e do negócio e, se o negócio não diz o produto, os itens do último
 * orçamento do cliente. Nome em maiúsculas (vindo da Receita) já vem só com
 * as iniciais maiúsculas, pra conferir antes de gerar.
 */
export async function dadosIniciaisContrato(
  negocioId: string,
  empresaEmissora: ChaveEmpresaEmissora = "LEGAUS",
  cliente: Cliente = prisma,
): Promise<{ dados: DadosContrato; origemProduto: string | null; temCliente: boolean }> {
  const negocio = await cliente.negocio.findUnique({ where: { id: negocioId }, include: { contato: true } });
  if (!negocio) throw new Error("Negócio não encontrado.");
  const c = negocio.contato;
  const pj = Boolean(c?.cnpj);

  let produto = negocio.produto?.trim() ?? "";
  let valorCentavos = negocio.valorCentavos;
  let origemProduto: string | null = null;
  if (!produto && c) {
    const orcamento = await ultimoOrcamentoDoCliente(c.id, cliente);
    if (orcamento) {
      produto = orcamento.itens.map((i) => (i.quantidade > 1 ? `${i.nome} (${i.quantidade} un.)` : i.nome)).join("\n");
      if (!valorCentavos) {
        valorCentavos = orcamento.itens.reduce((s, i) => s + i.quantidade * i.valorUnitarioCentavos, 0) - orcamento.descontoCentavos;
      }
      origemProduto = `orçamento nº ${String(orcamento.numero).padStart(4, "0")}`;
    }
  }

  return {
    origemProduto,
    temCliente: Boolean(c),
    dados: {
      empresaEmissora,
      clienteTipo: pj ? "PJ" : "PF",
      clienteNome: nomeProprio((pj ? c?.razaoSocial || c?.nome : c?.representanteLegalNome || c?.nome) ?? ""),
      clienteDocumento: formatarDocumento(pj ? c?.cnpj : c?.representanteLegalCpf) ?? "",
      clienteEndereco: nomeProprio(c?.endereco ?? ""),
      clienteCidade: nomeProprio(c?.cidade ?? ""),
      clienteUf: (c?.uf ?? "").toUpperCase(),
      clienteCep: c?.cep ?? "",
      representanteNome: pj ? nomeProprio(c?.representanteLegalNome ?? "") : "",
      representanteCpf: pj ? (formatarDocumento(c?.representanteLegalCpf) ?? "") : "",
      produto,
      especificacoes: negocio.descricao?.trim() ?? "",
      valorCentavos: Math.max(0, valorCentavos),
      formaPagamento: negocio.formaPagamento?.trim() ?? "",
      prazoEntregaDias: PRAZO_ENTREGA_PADRAO,
      garantiaMeses: GARANTIA_PADRAO,
      localInstalacao: "",
    },
  };
}

/**
 * O que foi digitado no formulário volta pro cadastro do cliente e pro
 * negócio, pra vir preenchido da próxima vez. Pessoa física: o nome completo
 * e o CPF ficam em "quem assina" (o cadastro não tem CPF próprio; o nome do
 * contato, que veio do WhatsApp, não muda).
 */
export async function guardarDadosDoContratoNoCadastro(negocioId: string, d: DadosContrato, cliente: Cliente = prisma): Promise<void> {
  const negocio = await cliente.negocio.findUnique({ where: { id: negocioId }, select: { contatoId: true } });
  if (!negocio) throw new Error("Negócio não encontrado.");
  if (negocio.contatoId) {
    const endereco = { endereco: d.clienteEndereco, cidade: d.clienteCidade, uf: d.clienteUf, ...(d.clienteCep ? { cep: d.clienteCep } : {}) };
    await cliente.contato.update({
      where: { id: negocio.contatoId },
      data:
        d.clienteTipo === "PJ"
          ? {
              ...endereco,
              razaoSocial: d.clienteNome,
              cnpj: formatarDocumento(d.clienteDocumento),
              representanteLegalNome: d.representanteNome,
              representanteLegalCpf: formatarDocumento(d.representanteCpf),
            }
          : { ...endereco, representanteLegalNome: d.clienteNome, representanteLegalCpf: formatarDocumento(d.clienteDocumento) },
    });
  }
  await cliente.negocio.update({ where: { id: negocioId }, data: { produto: d.produto, formaPagamento: d.formaPagamento } });
}

type NegocioDoContrato = Prisma.NegocioGetPayload<{ include: { contato: true } }>;

async function textoDoContrato(negocio: NegocioDoContrato, dados: DadosContrato, cliente: Cliente): Promise<string> {
  const modelo = await getModeloContratoAtivo(cliente);
  return mesclarModelo(
    modelo.conteudo,
    valoresDoContrato(dados, EMPRESAS_EMISSORAS[dados.empresaEmissora], {
      negocioTitulo: negocio.titulo,
      clienteTelefone: negocio.contato?.telefone ?? null,
      previsaoEntrega: negocio.previsaoFechamento,
      previsaoInstalacao: negocio.dataInstalacao,
      hoje: new Date(),
    }),
  );
}

const comoJson = (dados: DadosContrato) => dados as unknown as Prisma.InputJsonObject;

/**
 * Gera um contrato novo em RASCUNHO a partir do modelo ativo. Com `dados`
 * (respostas do formulário), usa eles; sem (Ganho pelo quadro ou pelo
 * agente), preenche com o que o CRM sabe e o formulário fica pra conferir na
 * tela do contrato. Aceita um client de transação pra rodar junto de outras
 * automações. `empresaEmissora` (Legaus Kids ou Idezza, ver
 * lib/constants/empresa.ts) só vale quando não vêm `dados`.
 */
export async function gerarContrato(
  negocioId: string,
  cliente: Cliente = prisma,
  opcoes: { empresaEmissora?: ChaveEmpresaEmissora; dados?: DadosContrato } = {},
) {
  const negocio = await cliente.negocio.findUnique({ where: { id: negocioId }, include: { contato: true } });
  if (!negocio) throw new Error("Negócio não encontrado.");
  const dados = opcoes.dados ?? (await dadosIniciaisContrato(negocioId, opcoes.empresaEmissora ?? "LEGAUS", cliente)).dados;
  const conteudo = await textoDoContrato(negocio, dados, cliente);
  return cliente.contrato.create({
    data: { negocioId, conteudo, empresaEmissora: dados.empresaEmissora, dados: comoJson(dados), status: "RASCUNHO" },
  });
}

export type ErroFormularioContrato = { error: string; campos?: ErrosContrato };

/** Valida as respostas do formulário; erro por campo pra marcar no formulário. */
export function validarFormularioContrato(bruto: unknown): { dados: DadosContrato } | ErroFormularioContrato {
  const r = dadosContratoSchema.safeParse(bruto);
  if (r.success) return { dados: r.data };
  return { error: "Faltam dados ou tem dado errado — confira os campos marcados.", campos: errosPorCampo(r.error.issues) };
}

/** "Gerar contrato" do Financeiro: formulário → cadastro atualizado → rascunho. */
export async function criarContratoComFormulario(negocioId: string, bruto: unknown): Promise<{ contratoId: string } | ErroFormularioContrato> {
  const validado = validarFormularioContrato(bruto);
  if ("error" in validado) return validado;
  await guardarDadosDoContratoNoCadastro(negocioId, validado.dados);
  const contrato = await gerarContrato(negocioId, prisma, { dados: validado.dados });
  return { contratoId: contrato.id };
}

const SO_RASCUNHO = "Esse contrato já foi finalizado — clique em Reabrir pra mudar.";

/** Refaz o texto do rascunho com os dados novos do formulário (as mudanças feitas à mão no texto se perdem). */
export async function atualizarDadosDoContrato(contratoId: string, bruto: unknown): Promise<{ conteudo: string } | ErroFormularioContrato> {
  const validado = validarFormularioContrato(bruto);
  if ("error" in validado) return validado;
  const contrato = await prisma.contrato.findUnique({ where: { id: contratoId }, select: { negocioId: true, status: true } });
  if (!contrato) return { error: "Contrato não encontrado." };
  if (contrato.status !== "RASCUNHO") return { error: SO_RASCUNHO };

  await guardarDadosDoContratoNoCadastro(contrato.negocioId, validado.dados);
  const negocio = await prisma.negocio.findUniqueOrThrow({ where: { id: contrato.negocioId }, include: { contato: true } });
  const conteudo = await textoDoContrato(negocio, validado.dados, prisma);
  await prisma.contrato.update({
    where: { id: contratoId },
    data: { conteudo, dados: comoJson(validado.dados), empresaEmissora: validado.dados.empresaEmissora },
  });
  return { conteudo };
}

export const TEXTO_CONTRATO_MAX = 100_000;

/** Texto editado à mão na tela do contrato (só enquanto é rascunho). */
export async function salvarTextoDoContrato(contratoId: string, conteudo: string): Promise<{ ok: true } | { error: string }> {
  const texto = normalizarQuebras(conteudo).trim();
  if (!texto) return { error: "O contrato não pode ficar vazio." };
  if (texto.length > TEXTO_CONTRATO_MAX) return { error: "Texto grande demais." };
  const { count } = await prisma.contrato.updateMany({ where: { id: contratoId, status: "RASCUNHO" }, data: { conteudo: texto } });
  return count > 0 ? { ok: true } : { error: SO_RASCUNHO };
}

/** Rascunho → Gerado: o PDF sai sem a marca de rascunho. */
export async function finalizarContrato(contratoId: string): Promise<{ ok: true } | { error: string }> {
  const { count } = await prisma.contrato.updateMany({ where: { id: contratoId, status: "RASCUNHO" }, data: { status: "GERADO" } });
  return count > 0 ? { ok: true } : { error: "Esse contrato não está mais em rascunho." };
}

/** Volta pra rascunho pra mexer no texto (contrato assinado ou cancelado não volta). */
export async function reabrirContrato(contratoId: string): Promise<{ ok: true } | { error: string }> {
  const { count } = await prisma.contrato.updateMany({
    where: { id: contratoId, status: { in: ["GERADO", "ENVIADO"] } },
    data: { status: "RASCUNHO" },
  });
  return count > 0 ? { ok: true } : { error: "Contrato assinado ou cancelado não volta pra rascunho." };
}

export function listarContratos() {
  return prisma.contrato.findMany({
    include: { negocio: { include: { contato: true } } },
    orderBy: { criadoEm: "desc" },
  });
}

export function buscarContratoPorId(id: string) {
  return prisma.contrato.findUnique({
    where: { id },
    include: { negocio: { include: { contato: true, responsavel: true } } },
  });
}

export async function atualizarStatusContrato(id: string, status: StatusContrato): Promise<void> {
  await prisma.contrato.update({ where: { id }, data: { status } });
}

/** Lista pra popular o seletor "gerar contrato pra qual negócio" na aba Contratos. */
export function listarNegociosParaSeletor() {
  return prisma.negocio.findMany({
    select: { id: true, titulo: true, contato: { select: { nome: true } } },
    orderBy: { updatedAt: "desc" },
    take: 60,
  });
}

/**
 * Cria um negócio (mínimo, direto na etapa Contrato do Funil de pós-venda)
 * e o contrato a partir de um orçamento ANTIGO que nunca entrou no CRM —
 * usado pelo agente quando alguém manda o PDF/foto de um orçamento de
 * antes do sistema existir (ver ferramenta gerar_contrato_de_orcamento_antigo
 * em lib/server/agente.ts). Claude já leu o anexo e extraiu os dados; essa
 * função só persiste — não tenta mesclar/atualizar um contato já existente
 * (usa como está, sem sobrescrever nada) pra não arriscar substituir dado
 * bom por algo mal extraído do PDF antigo.
 */
export async function criarContratoDeOrcamentoAntigo(input: {
  clienteNome: string;
  clienteTelefone?: string | null;
  clienteCnpj?: string | null;
  clienteEndereco?: string | null;
  clienteCidade?: string | null;
  clienteUf?: string | null;
  clienteRepresentanteNome?: string | null;
  clienteRepresentanteCpf?: string | null;
  produtoDescricao: string;
  valorCentavos: number;
  formaPagamento?: string | null;
  empresaEmissora: ChaveEmpresaEmissora;
  responsavelId: string;
}) {
  const telefoneNormalizado = input.clienteTelefone ? normalizarTelefone(input.clienteTelefone) : null;

  let contato = telefoneNormalizado ? await prisma.contato.findUnique({ where: { telefone: telefoneNormalizado } }) : null;
  if (!contato) {
    contato = await prisma.contato.findFirst({
      where: { OR: [{ nome: { equals: input.clienteNome, mode: "insensitive" } }, { razaoSocial: { equals: input.clienteNome, mode: "insensitive" } }] },
    });
  }
  if (!contato) {
    contato = await prisma.contato.create({
      data: {
        nome: input.clienteNome,
        tipo: "CLIENTE",
        telefone: telefoneNormalizado,
        cnpj: input.clienteCnpj || null,
        endereco: input.clienteEndereco || null,
        cidade: input.clienteCidade || null,
        uf: input.clienteUf || null,
        representanteLegalNome: input.clienteRepresentanteNome || null,
        representanteLegalCpf: input.clienteRepresentanteCpf || null,
      },
    });
  }

  const funilPosVenda = await prisma.funil.findFirstOrThrow({ where: { nome: "Funil de pós-venda" } });
  const etapaContrato = await prisma.etapa.findFirstOrThrow({ where: { funilId: funilPosVenda.id, nome: "Contrato" } });

  const negocio = await prisma.negocio.create({
    data: {
      titulo: `${input.clienteNome} — orçamento antigo`,
      contatoId: contato.id,
      funilId: funilPosVenda.id,
      etapaId: etapaContrato.id,
      valorCentavos: input.valorCentavos,
      responsavelId: input.responsavelId,
      produto: input.produtoDescricao,
      formaPagamento: input.formaPagamento || null,
      origem: "Orçamento antigo (pré-CRM, migrado via agente)",
    },
  });

  const contrato = await gerarContrato(negocio.id, prisma, { empresaEmissora: input.empresaEmissora });
  return { negocio, contrato, contatoNovo: contato };
}
