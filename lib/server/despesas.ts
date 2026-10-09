import "server-only";
import { prisma } from "@/lib/db";
import type { OrigemDespesa, Prisma, StatusDespesa } from "@prisma/client";
import {
  dataDaDespesa,
  pendenciasDaDespesa,
  statusDoFiltro,
  validarCentro,
  type FiltroDespesas,
} from "@/lib/utils/despesas";

// Despesas registradas na hora do gasto, antes do extrato — ver Despesa no
// schema. A conciliação com o extrato (pares) fica em conciliacao-bancaria.ts.

const SELECT_LISTA = {
  id: true,
  data: true,
  valorCentavos: true,
  fornecedor: true,
  descricao: true,
  status: true,
  origem: true,
  categoriaId: true,
  categoria: { select: { nome: true } },
  centroGeralId: true,
  centroGeral: { select: { nome: true } },
  negocioId: true,
  negocio: { select: { titulo: true, contato: { select: { nome: true } } } },
  transacao: { select: { data: true, descricao: true } },
  anexoMime: true,
  anexoNome: true,
  textoOriginal: true,
  registradaPor: { select: { nome: true } },
  // Etiqueta da conta (Sicredi/InfinitePay) quando veio de um push do banco.
  avisosBancarios: { select: { conta: true }, take: 1 },
  criadoEm: true,
} satisfies Prisma.DespesaSelect;

export function listDespesas(filtro: FiltroDespesas) {
  const status = statusDoFiltro(filtro);
  return prisma.despesa.findMany({
    where: status ? { status: { in: status } } : undefined,
    select: SELECT_LISTA,
    orderBy: [{ data: "desc" }, { criadoEm: "desc" }],
  });
}

/** Quantidade e soma por status — o "total pendente" do topo independe do filtro. */
export async function resumoDespesas() {
  const grupos = await prisma.despesa.groupBy({ by: ["status"], _count: true, _sum: { valorCentavos: true } });
  const de = (status: StatusDespesa) => {
    const g = grupos.find((x) => x.status === status);
    return { quantidade: g?._count ?? 0, totalCentavos: g?._sum.valorCentavos ?? 0 };
  };
  return { aConfirmar: de("A_CONFIRMAR"), aguardando: de("AGUARDANDO_CONCILIACAO"), conciliadas: de("CONCILIADA") };
}

export type DadosDespesa = {
  dia: string;
  valorCentavos: number;
  fornecedor: string;
  descricao?: string | null;
  categoriaId: string | null;
  centroGeralId: string | null;
  negocioId: string | null;
};

function normalizar(d: DadosDespesa) {
  validarCentro(d);
  return {
    data: dataDaDespesa(d.dia),
    valorCentavos: d.valorCentavos,
    fornecedor: d.fornecedor.trim(),
    descricao: d.descricao?.trim() || null,
    categoriaId: d.categoriaId || null,
    centroGeralId: d.centroGeralId || null,
    negocioId: d.negocioId || null,
  };
}

/**
 * Cria uma despesa. Sem `rascunho`, já entra aguardando conciliação e
 * precisa estar completa; com `rascunho` (agente do WhatsApp esperando o
 * "1"), pode faltar categoria/centro.
 */
export async function criarDespesa(
  d: DadosDespesa & {
    origem: OrigemDespesa;
    registradaPorId: string;
    rascunho?: boolean;
    anexo?: { bytes: Buffer; mime: string; nome: string | null };
    textoOriginal?: string | null;
    extracao?: Prisma.InputJsonValue;
    telefoneOrigem?: string | null;
  },
) {
  const campos = normalizar(d);
  if (!d.rascunho) {
    const faltando = pendenciasDaDespesa(campos);
    if (faltando.length) throw new Error(`Falta informar: ${faltando.join(", ")}.`);
  }
  return prisma.despesa.create({
    data: {
      ...campos,
      origem: d.origem,
      status: d.rascunho ? "A_CONFIRMAR" : "AGUARDANDO_CONCILIACAO",
      confirmadaEm: d.rascunho ? null : new Date(),
      registradaPorId: d.registradaPorId,
      anexoBytes: d.anexo ? new Uint8Array(d.anexo.bytes) : null,
      anexoMime: d.anexo?.mime ?? null,
      anexoNome: d.anexo?.nome ?? null,
      textoOriginal: d.textoOriginal?.trim() || null,
      extracao: d.extracao,
      telefoneOrigem: d.telefoneOrigem ?? null,
    },
  });
}

async function despesaEditavel(id: string) {
  const despesa = await prisma.despesa.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!despesa) throw new Error("Despesa não encontrada.");
  if (despesa.status === "CONCILIADA") {
    throw new Error("Essa despesa já está conciliada com o extrato — desfaça a conciliação antes de alterar.");
  }
  return despesa;
}

/** Edita uma despesa ainda não conciliada. Rascunho continua rascunho (confirmar é outro passo). */
export async function atualizarDespesa(id: string, d: DadosDespesa) {
  const atual = await despesaEditavel(id);
  const campos = normalizar(d);
  if (atual.status === "AGUARDANDO_CONCILIACAO") {
    const faltando = pendenciasDaDespesa(campos);
    if (faltando.length) throw new Error(`Falta informar: ${faltando.join(", ")}.`);
  }
  return prisma.despesa.update({ where: { id }, data: campos });
}

/** Rascunho -> aguardando conciliação (o "1" do WhatsApp, ou o botão na tela). */
export async function confirmarDespesa(id: string) {
  const despesa = await prisma.despesa.findUnique({ where: { id } });
  if (!despesa) throw new Error("Despesa não encontrada.");
  if (despesa.status !== "A_CONFIRMAR") return despesa;
  const faltando = pendenciasDaDespesa(despesa);
  if (faltando.length) throw new Error(`Falta informar: ${faltando.join(", ")}.`);
  return prisma.despesa.update({ where: { id }, data: { status: "AGUARDANDO_CONCILIACAO", confirmadaEm: new Date() } });
}

export async function excluirDespesa(id: string) {
  await despesaEditavel(id);
  await prisma.despesa.delete({ where: { id } });
}

export function getAnexoDespesa(id: string) {
  return prisma.despesa.findUnique({ where: { id }, select: { anexoBytes: true, anexoMime: true, anexoNome: true } });
}

/** Projetos pro seletor de centro: os mais recentes primeiro (mesmo critério da conciliação). */
export function listNegociosParaDespesa() {
  return prisma.negocio.findMany({
    select: { id: true, titulo: true, contato: { select: { nome: true } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}
