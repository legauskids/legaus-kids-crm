import "server-only";
import { prisma } from "@/lib/db";
import type { TipoCotacao } from "@prisma/client";
import type { MaoDeObraItem } from "@/lib/utils/cotacao-precificacao";

type ItemPadrao = { secao: string; nome: string; custoUnitarioCentavos: number };

// Itens e seções padrão reconstruídos das planilhas que o Marcos já usa
// (Playground-Cotação e Kidplay-Cotação) — servem de ponto de partida
// editável pra uma cotação nova; nada aqui é fixo, dá pra editar, apagar ou
// inserir linha depois. Brinquedos e Outros ainda não têm planilha de
// referência — começam vazios até o Marcos mandar.
const ITENS_PADRAO: Record<TipoCotacao, ItemPadrao[]> = {
  PLAYGROUND: [
    { secao: "Torre", nome: "Madeira Plástica com Patamar", custoUnitarioCentavos: 150000 },
    { secao: "Torre", nome: "Telhado com Ferro", custoUnitarioCentavos: 80000 },
    { secao: "Torre", nome: "Coqueiro", custoUnitarioCentavos: 38000 },
    { secao: "Torre", nome: "Flor", custoUnitarioCentavos: 38000 },
    { secao: "Conexão", nome: "Tubo Reto", custoUnitarioCentavos: 150000 },
    { secao: "Conexão", nome: "Tubo Curvo", custoUnitarioCentavos: 90000 },
    { secao: "Conexão", nome: "Flange Unidade", custoUnitarioCentavos: 39441 },
    { secao: "Conexão", nome: "Ponte Reta", custoUnitarioCentavos: 135000 },
    { secao: "Conexão", nome: "Ponte Positiva", custoUnitarioCentavos: 120000 },
    { secao: "Conexão", nome: "Disco", custoUnitarioCentavos: 0 },
    { secao: "Conexão", nome: "Ponte Negativa", custoUnitarioCentavos: 120000 },
    { secao: "Subidas", nome: "Escada Normal", custoUnitarioCentavos: 56880 },
    { secao: "Subidas", nome: "Escalada", custoUnitarioCentavos: 121954 },
    { secao: "Subidas", nome: "Corda", custoUnitarioCentavos: 55152 },
    { secao: "Subidas", nome: "Espiral", custoUnitarioCentavos: 35712 },
    { secao: "Descidas", nome: "Escorregador Duplo Ondulado", custoUnitarioCentavos: 0 },
    { secao: "Descidas", nome: "Escorregador Simples", custoUnitarioCentavos: 109680 },
    { secao: "Descidas", nome: "Escorregador Duplo", custoUnitarioCentavos: 217680 },
    { secao: "Descidas", nome: "Escorregador Curvo", custoUnitarioCentavos: 0 },
    { secao: "Descidas", nome: "Escorregador Tubo", custoUnitarioCentavos: 295000 },
    { secao: "Descidas", nome: "Bombeiro", custoUnitarioCentavos: 31376 },
    { secao: "Descidas", nome: "Caracol", custoUnitarioCentavos: 450000 },
    { secao: "Proteções", nome: "Aberta Metálica", custoUnitarioCentavos: 7500 },
    { secao: "Proteções", nome: "Fechada Metálica", custoUnitarioCentavos: 12000 },
    { secao: "Opcionais", nome: "Jogo da Velha", custoUnitarioCentavos: 68494 },
    { secao: "Opcionais", nome: "Balanço 1 Lugar", custoUnitarioCentavos: 132000 },
    { secao: "Opcionais", nome: "Balanço 2 Lugares", custoUnitarioCentavos: 180000 },
    { secao: "Opcionais", nome: "Balanço 3 Lugares", custoUnitarioCentavos: 0 },
  ],
  KIDPLAY: [
    { secao: "Estrutura", nome: "Barra de Ferro", custoUnitarioCentavos: 12500 },
    { secao: "Estrutura", nome: "Isotubos", custoUnitarioCentavos: 2500 },
    { secao: "Estrutura", nome: "Conexões", custoUnitarioCentavos: 2750 },
    { secao: "Estrutura", nome: "Tubos Hidrófuro", custoUnitarioCentavos: 15000 },
    { secao: "Estrutura", nome: "Rede", custoUnitarioCentavos: 2000 },
    { secao: "Estrutura", nome: "Presilhas Milheiro", custoUnitarioCentavos: 30000 },
    { secao: "Patamar", nome: "MDF", custoUnitarioCentavos: 28000 },
    { secao: "Patamar", nome: "Lona Patamar", custoUnitarioCentavos: 3900 },
    { secao: "Patamar", nome: "Espuma", custoUnitarioCentavos: 1500 },
    { secao: "Obstáculos", nome: "Túnel de Fitas", custoUnitarioCentavos: 60000 },
    { secao: "Obstáculos", nome: "Túnel de Elástico", custoUnitarioCentavos: 50000 },
    { secao: "Obstáculos", nome: "Soção", custoUnitarioCentavos: 10000 },
    { secao: "Obstáculos", nome: "Floresta", custoUnitarioCentavos: 10000 },
    { secao: "Obstáculos", nome: "Morrinho", custoUnitarioCentavos: 20000 },
    { secao: "Obstáculos", nome: "Pirâmide", custoUnitarioCentavos: 20000 },
    { secao: "Obstáculos", nome: "Parede", custoUnitarioCentavos: 20000 },
    { secao: "Obstáculos", nome: "Rolinho", custoUnitarioCentavos: 15000 },
    { secao: "Obstáculos", nome: "Túnel de Ligação", custoUnitarioCentavos: 30000 },
    { secao: "Descidas", nome: "Escorregador Duplo Pequeno", custoUnitarioCentavos: 0 },
    { secao: "Descidas", nome: "Escorregador Simples Pequeno", custoUnitarioCentavos: 30000 },
    { secao: "Descidas", nome: "Escorregador Duplo Grande", custoUnitarioCentavos: 169800 },
    { secao: "Descidas", nome: "Escorregador Simples Grande", custoUnitarioCentavos: 80000 },
    { secao: "Descidas", nome: "Escorregador Tubo Curvas", custoUnitarioCentavos: 100000 },
    { secao: "Opcionais", nome: "Saco 500 Bolinhas", custoUnitarioCentavos: 30000 },
    { secao: "Opcionais", nome: "Cama Elástica", custoUnitarioCentavos: 150000 },
    { secao: "Opcionais", nome: "Jogo da Velha", custoUnitarioCentavos: 0 },
    { secao: "Opcionais", nome: "Bolha Acrílica", custoUnitarioCentavos: 150000 },
  ],
  BRINQUEDOS: [],
  OUTROS: [],
};

const MAO_DE_OBRA_PADRAO: Record<TipoCotacao, string[]> = {
  PLAYGROUND: ["Mão de obra Fundisa"],
  KIDPLAY: ["Mão de obra TL", "Mão de obra Estofador"],
  BRINQUEDOS: ["Mão de obra"],
  OUTROS: ["Mão de obra"],
};

export const TITULO_PADRAO: Record<TipoCotacao, string> = {
  PLAYGROUND: "Nova cotação de Playground",
  KIDPLAY: "Nova cotação de Kidplay",
  BRINQUEDOS: "Nova cotação de Brinquedos",
  OUTROS: "Nova cotação",
};

export async function criarCotacao(tipo: TipoCotacao, criadoPorId: string) {
  const itensPadrao = ITENS_PADRAO[tipo];
  const maoDeObra: MaoDeObraItem[] = MAO_DE_OBRA_PADRAO[tipo].map((label) => ({ label, valorCentavos: 0 }));

  return prisma.cotacao.create({
    data: {
      tipo,
      titulo: TITULO_PADRAO[tipo],
      maoDeObra,
      itens: {
        create: itensPadrao.map((item, ordem) => ({
          secao: item.secao,
          nome: item.nome,
          quantidade: 0,
          custoUnitarioCentavos: item.custoUnitarioCentavos,
          ordem,
        })),
      },
      criadoPorId,
    },
  });
}

export function listarCotacoes(tipo?: TipoCotacao) {
  return prisma.cotacao.findMany({
    where: tipo ? { tipo } : undefined,
    select: {
      id: true,
      numero: true,
      tipo: true,
      titulo: true,
      criadoEm: true,
      atualizadoEm: true,
      criadoPor: { select: { nome: true } },
      _count: { select: { itens: true } },
    },
    orderBy: { criadoEm: "desc" },
  });
}

export function buscarCotacaoPorId(id: string) {
  return prisma.cotacao.findUnique({
    where: { id },
    include: {
      itens: { orderBy: { ordem: "asc" } },
      criadoPor: { select: { nome: true } },
    },
  });
}

export async function atualizarTituloCotacao(id: string, titulo: string): Promise<void> {
  await prisma.cotacao.update({ where: { id }, data: { titulo } });
}

export type CampoResumoCotacao =
  | "markup"
  | "adicionalCentavos"
  | "instalacaoPercentual"
  | "freteKm"
  | "fretePrecoPorKmCentavos"
  | "impostoCentavos";

export async function atualizarCampoResumoCotacao(id: string, campo: CampoResumoCotacao, valor: number): Promise<void> {
  await prisma.cotacao.update({ where: { id }, data: { [campo]: valor } });
}

export async function atualizarMaoDeObraCotacao(id: string, indice: number, valorCentavos: number): Promise<void> {
  const cotacao = await prisma.cotacao.findUniqueOrThrow({ where: { id }, select: { maoDeObra: true } });
  const maoDeObra = cotacao.maoDeObra as unknown as MaoDeObraItem[];
  if (!maoDeObra[indice]) return;
  maoDeObra[indice] = { ...maoDeObra[indice], valorCentavos };
  await prisma.cotacao.update({ where: { id }, data: { maoDeObra } });
}

export async function criarItemCotacao(cotacaoId: string, secao: string) {
  const ultimo = await prisma.cotacaoItem.findFirst({ where: { cotacaoId }, orderBy: { ordem: "desc" } });
  return prisma.cotacaoItem.create({
    data: { cotacaoId, secao, nome: "Novo item", quantidade: 0, custoUnitarioCentavos: 0, ordem: (ultimo?.ordem ?? -1) + 1 },
  });
}

export type CampoItemCotacao = "nome" | "quantidade" | "custoUnitarioCentavos" | "secao";

export async function atualizarItemCotacao(itemId: string, campo: CampoItemCotacao, valor: string | number): Promise<void> {
  await prisma.cotacaoItem.update({ where: { id: itemId }, data: { [campo]: valor } });
}

export async function excluirItemCotacao(itemId: string): Promise<void> {
  await prisma.cotacaoItem.delete({ where: { id: itemId } });
}

export async function excluirCotacao(id: string): Promise<void> {
  await prisma.cotacao.delete({ where: { id } });
}
