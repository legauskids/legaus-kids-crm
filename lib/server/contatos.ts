import "server-only";
import { prisma } from "@/lib/db";
import type { TipoContato } from "@prisma/client";

export function normalizarTelefone(telefone: string): string {
  return telefone.replace(/\D/g, "");
}

export async function existeContatoComTelefone(telefone: string): Promise<boolean> {
  const contato = await prisma.contato.findUnique({ where: { telefone: normalizarTelefone(telefone) }, select: { id: true } });
  return contato != null;
}

/** Usado pelo painel da extensão pra decidir entre a tela de "contato novo" e a de resumo. */
export function buscarContatoComNegociosPorTelefone(telefone: string) {
  return prisma.contato.findUnique({
    where: { telefone: normalizarTelefone(telefone) },
    include: {
      negocios: {
        include: { funil: true, etapa: true },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
}

/**
 * Cria o Contato se o telefone for novo; se já existir, só atualiza o nome
 * quando o registro atual ainda está com o telefone como nome (placeholder
 * de quando o contato surgiu de uma mensagem antes de ter nome salvo).
 */
export async function salvarContatoPorTelefone(input: {
  telefone: string;
  nome?: string;
  empresa?: string;
}) {
  const telefone = normalizarTelefone(input.telefone);
  const nome = input.nome?.trim();
  const empresa = input.empresa?.trim();

  const existente = await prisma.contato.findUnique({ where: { telefone } });
  if (existente) {
    const deveAtualizarNome = nome && existente.nome === existente.telefone;
    if (!deveAtualizarNome && !empresa) return existente;
    return prisma.contato.update({
      where: { id: existente.id },
      data: {
        nome: deveAtualizarNome ? nome : existente.nome,
        empresa: empresa || existente.empresa,
      },
    });
  }

  return prisma.contato.create({
    data: { telefone, nome: nome || telefone, empresa: empresa || null },
  });
}

/** Substitui a lista de etiquetas do contato (cria o contato se o telefone for novo). */
export async function definirTagsContato(telefone: string, tags: string[]) {
  const telefoneNormalizado = normalizarTelefone(telefone);
  const tagsLimpas = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];

  const existente = await prisma.contato.findUnique({ where: { telefone: telefoneNormalizado } });
  if (existente) {
    return prisma.contato.update({ where: { id: existente.id }, data: { tags: tagsLimpas } });
  }
  return prisma.contato.create({
    data: { telefone: telefoneNormalizado, nome: telefoneNormalizado, tags: tagsLimpas },
  });
}

/** Usado pela exportação CSV da extensão. */
export function listTodosContatosParaExportar() {
  return prisma.contato.findMany({
    select: { nome: true, telefone: true, empresa: true, tags: true },
    orderBy: { nome: "asc" },
  });
}

/** Lista para a aba Cadastros, com busca e filtro por tipo (contato/cliente/fornecedor). */
export function listarContatosParaPainel(tipo: TipoContato, busca?: string) {
  return prisma.contato.findMany({
    where: {
      tipo,
      ...(busca
        ? {
            OR: [
              { nome: { contains: busca, mode: "insensitive" } },
              { telefone: { contains: busca } },
              { empresa: { contains: busca, mode: "insensitive" } },
              { razaoSocial: { contains: busca, mode: "insensitive" } },
              { cnpj: { contains: busca } },
            ],
          }
        : {}),
    },
    include: { _count: { select: { negocios: true, conversas: true } } },
    orderBy: { nome: "asc" },
  });
}

export function buscarContatoPorId(contatoId: string) {
  return prisma.contato.findUnique({
    where: { id: contatoId },
    include: {
      negocios: { include: { funil: true, etapa: true }, orderBy: { updatedAt: "desc" } },
      conversas: { select: { id: true }, take: 1 },
    },
  });
}

export type AtualizarContatoInput = {
  nome?: string;
  empresa?: string | null;
  tags?: string[];
  cnpj?: string | null;
  razaoSocial?: string | null;
  inscricaoEstadual?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  email?: string | null;
  telefone?: string | null;
  representanteLegalNome?: string | null;
  representanteLegalCpf?: string | null;
};

export function atualizarContato(contatoId: string, input: AtualizarContatoInput) {
  const { telefone, ...resto } = input;
  return prisma.contato.update({
    where: { id: contatoId },
    data: { ...resto, telefone: telefone ? normalizarTelefone(telefone) : telefone },
  });
}

export type CriarContatoInput = {
  nome: string;
  telefone?: string | null;
  empresa?: string | null;
  tipo: TipoContato;
  cnpj?: string | null;
  razaoSocial?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  email?: string | null;
  representanteLegalNome?: string | null;
  representanteLegalCpf?: string | null;
};

export function criarContato(input: CriarContatoInput) {
  return prisma.contato.create({
    data: {
      nome: input.nome,
      telefone: input.telefone ? normalizarTelefone(input.telefone) : null,
      empresa: input.empresa || null,
      tipo: input.tipo,
      cnpj: input.cnpj || null,
      razaoSocial: input.razaoSocial || null,
      endereco: input.endereco || null,
      cidade: input.cidade || null,
      uf: input.uf || null,
      cep: input.cep || null,
      email: input.email || null,
      representanteLegalNome: input.representanteLegalNome || null,
      representanteLegalCpf: input.representanteLegalCpf || null,
    },
  });
}

/** Quantos registros de cada tipo ainda apontam pro contato — usado pra decidir se dá pra apagar direto ou se precisa mesclar. */
async function contarVinculosContato(contatoId: string) {
  const [negocios, conversas, orcamentos, tarefas, notasFiscais] = await Promise.all([
    prisma.negocio.count({ where: { contatoId } }),
    prisma.conversa.count({ where: { contatoId } }),
    prisma.orcamento.count({ where: { contatoId } }),
    prisma.tarefa.count({ where: { contatoId } }),
    prisma.notaFiscal.count({ where: { contatoId } }),
  ]);
  return { negocios, conversas, orcamentos, tarefas, notasFiscais };
}

/**
 * Só apaga de verdade quando o contato não tem nada vinculado (sem FK pra
 * quebrar) — a maioria dos contatos que chegam pelo WhatsApp já tem pelo
 * menos uma Conversa (criada automaticamente na primeira mensagem), então
 * isso bloqueia a maior parte dos casos de "apagar duplicado" de propósito:
 * esse caso é mesclarContatos, não exclusão simples (perderia os dados do
 * contato apagado em vez de preservar).
 */
export async function excluirContato(contatoId: string) {
  const vinculos = await contarVinculosContato(contatoId);
  const total = vinculos.negocios + vinculos.conversas + vinculos.orcamentos + vinculos.tarefas + vinculos.notasFiscais;
  if (total > 0) {
    const partes = [
      vinculos.negocios > 0 && `${vinculos.negocios} negócio(s)`,
      vinculos.conversas > 0 && `${vinculos.conversas} conversa(s)`,
      vinculos.orcamentos > 0 && `${vinculos.orcamentos} orçamento(s)`,
      vinculos.tarefas > 0 && `${vinculos.tarefas} tarefa(s)`,
      vinculos.notasFiscais > 0 && `${vinculos.notasFiscais} nota(s) fiscal(is)`,
    ].filter(Boolean);
    throw new Error(
      `Não dá pra apagar: esse contato tem ${partes.join(", ")} vinculado(s). Se for um cadastro duplicado, use mesclar em vez de apagar.`,
    );
  }
  return prisma.contato.delete({ where: { id: contatoId } });
}

const CAMPOS_TEXTO_MESCLAVEIS = [
  "telefone",
  "empresa",
  "cnpj",
  "razaoSocial",
  "inscricaoEstadual",
  "endereco",
  "cidade",
  "uf",
  "cep",
  "email",
  "representanteLegalNome",
  "representanteLegalCpf",
] as const;

/**
 * Mescla dois cadastros de contato que são a mesma pessoa/empresa
 * duplicada: tudo que apontava pro contato removido (conversas, negócios,
 * orçamentos, tarefas, notas fiscais) passa a apontar pro contato mantido,
 * os campos que só o removido tinha preenchido preenchem os que estavam em
 * branco no mantido (nunca sobrescreve um valor que o mantido já tinha), e
 * o contato removido é apagado no final. Ordem importa pro telefone (campo
 * único): apaga o removido ANTES de copiar o telefone dele pro mantido,
 * senão os dois registros teriam o mesmo telefone ao mesmo tempo.
 */
export async function mesclarContatos(manterId: string, removerId: string) {
  if (manterId === removerId) throw new Error("Não dá pra mesclar um contato com ele mesmo.");

  return prisma.$transaction(async (tx) => {
    const [manter, remover] = await Promise.all([
      tx.contato.findUniqueOrThrow({ where: { id: manterId } }),
      tx.contato.findUniqueOrThrow({ where: { id: removerId } }),
    ]);

    const [negocios, conversas, orcamentos, tarefas, notasFiscais] = await Promise.all([
      tx.negocio.updateMany({ where: { contatoId: removerId }, data: { contatoId: manterId } }),
      tx.conversa.updateMany({ where: { contatoId: removerId }, data: { contatoId: manterId } }),
      tx.orcamento.updateMany({ where: { contatoId: removerId }, data: { contatoId: manterId } }),
      tx.tarefa.updateMany({ where: { contatoId: removerId }, data: { contatoId: manterId } }),
      tx.notaFiscal.updateMany({ where: { contatoId: removerId }, data: { contatoId: manterId } }),
    ]);

    const tagsUnificadas = [...new Set([...manter.tags, ...remover.tags])];
    await tx.contato.delete({ where: { id: removerId } });

    const camposPreenchidos: Record<string, string> = {};
    for (const campo of CAMPOS_TEXTO_MESCLAVEIS) {
      if (!manter[campo] && remover[campo]) camposPreenchidos[campo] = remover[campo] as string;
    }

    const mesclado = await tx.contato.update({
      where: { id: manterId },
      data: { ...camposPreenchidos, tags: tagsUnificadas, nome: manter.nome || remover.nome },
    });

    return {
      contato: mesclado,
      movidos: {
        negocios: negocios.count,
        conversas: conversas.count,
        orcamentos: orcamentos.count,
        tarefas: tarefas.count,
        notasFiscais: notasFiscais.count,
      },
      camposPreenchidos: Object.keys(camposPreenchidos),
    };
  });
}

/** Pra combo "cliente" em telas como Orçamento — todos os tipos, busca leve. */
export function listarContatosParaCombo(busca?: string) {
  return prisma.contato.findMany({
    where: busca
      ? {
          OR: [
            { nome: { contains: busca, mode: "insensitive" } },
            { razaoSocial: { contains: busca, mode: "insensitive" } },
          ],
        }
      : undefined,
    select: { id: true, nome: true, empresa: true, razaoSocial: true, tipo: true },
    orderBy: { nome: "asc" },
    take: 50,
  });
}
