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
  { chave: "negocio_titulo", descricao: "Título do negócio" },
  { chave: "negocio_produto", descricao: "Produto do negócio" },
  { chave: "negocio_descricao", descricao: "Descrição do negócio" },
  { chave: "valor", descricao: "Valor total, já formatado em R$" },
  { chave: "previsao_entrega", descricao: "Previsão de fechamento/entrega" },
  { chave: "previsao_instalacao", descricao: "Previsão de instalação" },
  { chave: "data_hoje", descricao: "Data de hoje" },
  { chave: "empresa_razao_social", descricao: "Razão social da Legaus Kids" },
  { chave: "empresa_cnpj", descricao: "CNPJ da Legaus Kids" },
  { chave: "empresa_endereco", descricao: "Endereço da Legaus Kids" },
  { chave: "empresa_cidade_uf", descricao: "Cidade/UF da Legaus Kids" },
] as const;

const MODELO_PADRAO_INICIAL = `CONTRATADA: {{empresa_razao_social}}, CNPJ {{empresa_cnpj}}, com sede em {{empresa_endereco}}, {{empresa_cidade_uf}}, doravante denominada CONTRATADA.

CONTRATANTE: {{cliente_razao_social}}, CNPJ {{cliente_cnpj}}, com endereço em {{cliente_endereco}}, {{cliente_cidade_uf}}, telefone {{cliente_telefone}}, doravante denominado(a) CONTRATANTE.

Cláusula 1ª — Do objeto
O presente contrato tem por objeto o fornecimento de {{negocio_produto}}, referente ao negócio "{{negocio_titulo}}", incluindo fabricação, entrega e instalação no endereço do CONTRATANTE, conforme condições comerciais previamente acordadas. {{negocio_descricao}}

Cláusula 2ª — Do valor e forma de pagamento
O valor total dos produtos/serviços contratados é de {{valor}}, a ser pago conforme condições e prazos definidos entre as partes previamente à assinatura deste instrumento.

Cláusula 3ª — Do prazo
Previsão de fechamento/entrega: {{previsao_entrega}}. Previsão de instalação: {{previsao_instalacao}}. Os prazos poderão ser ajustados mediante acordo entre as partes, especialmente em razão de disponibilidade de material ou condições climáticas para a instalação.

Cláusula 4ª — Da garantia
A CONTRATADA garante os produtos fornecidos contra defeitos de fabricação pelo prazo de 12 (doze) meses a contar da data de instalação, conforme disposto no Código de Defesa do Consumidor (Lei nº 8.078/1990), não estando cobertos danos decorrentes de mau uso, vandalismo ou desgaste natural.

Cláusula 5ª — Da rescisão
O presente contrato poderá ser rescindido por qualquer das partes em caso de descumprimento das obrigações aqui previstas, mediante notificação prévia por escrito, resguardado o direito ao ressarcimento de valores já pagos proporcionalmente aos serviços não executados.

Cláusula 6ª — Do foro
Fica eleito o foro da comarca de {{empresa_cidade_uf}} para dirimir quaisquer dúvidas oriundas deste contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.

E por estarem assim justas e contratadas, as partes assinam o presente instrumento em duas vias de igual teor.

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
    negocio_titulo: negocio.titulo,
    negocio_produto: negocio.produto || negocio.titulo,
    negocio_descricao: negocio.descricao || "",
    valor: centavosParaReais(negocio.valorCentavos),
    previsao_entrega: negocio.previsaoFechamento ? formatarData(negocio.previsaoFechamento) : "a combinar",
    previsao_instalacao: negocio.dataInstalacao ? formatarData(negocio.dataInstalacao) : "a combinar",
    data_hoje: formatarData(new Date()),
    empresa_razao_social: EMPRESA.razaoSocial,
    empresa_cnpj: EMPRESA.cnpj,
    empresa_endereco: `${EMPRESA.endereco}, ${EMPRESA.bairro}`,
    empresa_cidade_uf: `${EMPRESA.cidade}/${EMPRESA.uf}`,
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
