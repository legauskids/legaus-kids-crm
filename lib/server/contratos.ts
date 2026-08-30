import "server-only";
import { prisma } from "@/lib/db";
import { EMPRESA } from "@/lib/constants/empresa";
import { centavosParaReais } from "@/lib/utils/money";
import type { StatusContrato, Prisma } from "@prisma/client";

type Cliente = Prisma.TransactionClient | typeof prisma;

export const CAMPOS_MODELO_CONTRATO = [
  { chave: "cliente_nome", descricao: "Nome do cliente" },
  { chave: "cliente_razao_social", descricao: "Razão social do cliente (cai pro nome se não tiver)" },
  { chave: "cliente_cnpj", descricao: "CNPJ do cliente" },
  { chave: "cliente_endereco", descricao: "Endereço do cliente" },
  { chave: "cliente_cidade_uf", descricao: "Cidade/UF do cliente" },
  { chave: "cliente_telefone", descricao: "Telefone do cliente" },
  { chave: "cliente_representante_nome", descricao: "Nome de quem assina pelo cliente" },
  { chave: "cliente_representante_cpf", descricao: "CPF de quem assina pelo cliente" },
  { chave: "negocio_titulo", descricao: "Título do negócio" },
  { chave: "negocio_produto", descricao: "Produto do negócio" },
  { chave: "negocio_descricao", descricao: "Descrição do negócio" },
  { chave: "valor", descricao: "Valor total, já formatado em R$" },
  { chave: "forma_pagamento", descricao: "Forma de pagamento combinada" },
  { chave: "previsao_entrega", descricao: "Previsão de fechamento/entrega" },
  { chave: "previsao_instalacao", descricao: "Previsão de instalação" },
  { chave: "data_hoje", descricao: "Data de hoje" },
  { chave: "empresa_razao_social", descricao: "Razão social da Legaus Kids" },
  { chave: "empresa_nome_fantasia", descricao: "Nome fantasia da Legaus Kids" },
  { chave: "empresa_cnpj", descricao: "CNPJ da Legaus Kids" },
  { chave: "empresa_endereco", descricao: "Endereço da Legaus Kids" },
  { chave: "empresa_cidade_uf", descricao: "Cidade/UF da Legaus Kids" },
  { chave: "empresa_representante_nome", descricao: "Nome de quem assina pela Legaus Kids" },
  { chave: "empresa_representante_cpf", descricao: "CPF de quem assina pela Legaus Kids" },
] as const;

// Convertido do modelo real que a Legaus Kids já usa (contrato Legaus x Dom
// Quixote, 28/07/2026) — clausulado mantido como está, só parametrizado.
const MODELO_PADRAO_INICIAL = `CONTRATO PARTICULAR DE COMPRA E VENDA

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

function formatarData(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(data);
}

/** Sempre existe um só modelo "ativo" — cria o padrão inicial na primeira vez que alguém acessa. */
export async function getModeloContratoAtivo(cliente: Cliente = prisma) {
  const existente = await cliente.modeloContrato.findFirst({ orderBy: { criadoEm: "asc" } });
  if (existente) return existente;
  return cliente.modeloContrato.create({ data: { conteudo: MODELO_PADRAO_INICIAL } });
}

export async function salvarModeloContrato(conteudo: string) {
  const atual = await getModeloContratoAtivo();
  return prisma.modeloContrato.update({ where: { id: atual.id }, data: { conteudo } });
}

function mesclarPlaceholders(texto: string, valores: Record<string, string>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (correspondencia, chave) => valores[chave] ?? correspondencia);
}

const CAMPOS_OBRIGATORIOS_CONTRATO = [
  { campo: "razaoSocial", label: "Razão social (ou nome) do cliente", checar: (c: { razaoSocial: string | null; nome: string }) => Boolean(c.razaoSocial || c.nome) },
  { campo: "cnpj", label: "CNPJ do cliente", checar: (c: { cnpj: string | null }) => Boolean(c.cnpj) },
  { campo: "endereco", label: "Endereço do cliente", checar: (c: { endereco: string | null }) => Boolean(c.endereco) },
  { campo: "cidadeUf", label: "Cidade/UF do cliente", checar: (c: { cidade: string | null; uf: string | null }) => Boolean(c.cidade && c.uf) },
  { campo: "representanteNome", label: "Nome do representante legal do cliente", checar: (c: { representanteLegalNome: string | null }) => Boolean(c.representanteLegalNome) },
  { campo: "representanteCpf", label: "CPF do representante legal do cliente", checar: (c: { representanteLegalCpf: string | null }) => Boolean(c.representanteLegalCpf) },
] as const;

/**
 * Confere se o negócio tem os dados mínimos pro contrato antes de deixar
 * marcar como Ganho — evita fechar negócio e só descobrir depois que falta
 * CNPJ/representante/forma de pagamento na hora de gerar o contrato de
 * verdade. Retorna a lista do que falta (vazia = tudo certo).
 */
export async function validarDadosParaContrato(negocioId: string, cliente: Cliente = prisma): Promise<string[]> {
  const negocio = await cliente.negocio.findUnique({ where: { id: negocioId }, include: { contato: true } });
  if (!negocio) return ["Negócio não encontrado"];

  const faltando: string[] = [];
  if (!negocio.contato) {
    faltando.push("Cliente vinculado ao negócio");
  } else {
    for (const item of CAMPOS_OBRIGATORIOS_CONTRATO) {
      if (!item.checar(negocio.contato as never)) faltando.push(item.label);
    }
  }
  if (!negocio.formaPagamento) faltando.push("Forma de pagamento (na aba Dados do negócio)");

  return faltando;
}

/** Gera um contrato novo (snapshot salvo) a partir do modelo ativo + dados atuais do negócio. Aceita um client de transação pra rodar junto de outras automações. */
export async function gerarContrato(negocioId: string, cliente: Cliente = prisma) {
  const negocio = await cliente.negocio.findUnique({ where: { id: negocioId }, include: { contato: true } });
  if (!negocio) throw new Error("Negócio não encontrado.");
  const modelo = await getModeloContratoAtivo(cliente);
  const c = negocio.contato;

  const valores: Record<string, string> = {
    cliente_nome: c?.nome ?? "(cliente não vinculado)",
    cliente_razao_social: c?.razaoSocial || c?.nome || "(cliente não vinculado)",
    cliente_cnpj: c?.cnpj || "não informado",
    cliente_endereco: c?.endereco || "não informado",
    cliente_cidade_uf: c?.cidade ? `${c.cidade}/${c.uf}` : "não informado",
    cliente_telefone: c?.telefone || "não informado",
    cliente_representante_nome: c?.representanteLegalNome || "não informado",
    cliente_representante_cpf: c?.representanteLegalCpf || "não informado",
    negocio_titulo: negocio.titulo,
    negocio_produto: negocio.produto || negocio.titulo,
    negocio_descricao: negocio.descricao || "",
    valor: centavosParaReais(negocio.valorCentavos),
    forma_pagamento: negocio.formaPagamento || "a combinar entre as partes",
    previsao_entrega: negocio.previsaoFechamento ? formatarData(negocio.previsaoFechamento) : "a combinar",
    previsao_instalacao: negocio.dataInstalacao ? formatarData(negocio.dataInstalacao) : "a combinar",
    data_hoje: formatarData(new Date()),
    empresa_razao_social: EMPRESA.razaoSocial,
    empresa_nome_fantasia: EMPRESA.nomeFantasia,
    empresa_cnpj: EMPRESA.cnpj,
    empresa_endereco: `${EMPRESA.endereco}, ${EMPRESA.bairro}`,
    empresa_cidade_uf: `${EMPRESA.cidade}/${EMPRESA.uf}`,
    empresa_representante_nome: EMPRESA.representanteNome,
    empresa_representante_cpf: EMPRESA.representanteCpf,
  };

  const conteudo = mesclarPlaceholders(modelo.conteudo, valores);
  return cliente.contrato.create({ data: { negocioId, conteudo } });
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
