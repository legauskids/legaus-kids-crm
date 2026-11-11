import "server-only";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import {
  MAX_ANEXOS,
  TAMANHO_PADRAO,
  anexosParaSalvarSchema,
  type AnexoOrcamentoVM,
} from "@/lib/utils/anexos-orcamento";

// Imagens anexas ao orçamento (lib/utils/anexos-orcamento.ts). O PDF
// (lib/server/pdf/orcamento-pdf.tsx) lê os bytes daqui; a tela, a impressão e
// o link público pegam pela rota /api/imagem/orcamento-anexo/[id].

const CAMPOS_VM = { id: true, nome: true, legenda: true, largura: true, altura: true, tamanho: true } as const;
const ORDEM = [{ ordem: "asc" as const }, { criadoEm: "asc" as const }];

export function listarAnexosOrcamento(orcamentoId: string): Promise<AnexoOrcamentoVM[]> {
  return prisma.orcamentoAnexo.findMany({ where: { orcamentoId }, select: CAMPOS_VM, orderBy: ORDEM });
}

/** Com os bytes, pro PDF. */
export function anexosOrcamentoParaPdf(orcamentoId: string) {
  return prisma.orcamentoAnexo.findMany({ where: { orcamentoId }, select: { ...CAMPOS_VM, bytes: true }, orderBy: ORDEM });
}

const LADO_MAXIMO = 2400;

export async function guardarAnexoOrcamento(orcamentoId: string, arquivo: Buffer, nome: string | null): Promise<AnexoOrcamentoVM> {
  const [quantos, ultimo] = await Promise.all([
    prisma.orcamentoAnexo.count({ where: { orcamentoId } }),
    prisma.orcamentoAnexo.findFirst({ where: { orcamentoId }, orderBy: { ordem: "desc" }, select: { ordem: true } }),
  ]);
  if (quantos >= MAX_ANEXOS) throw new Error(`No máximo ${MAX_ANEXOS} imagens por orçamento — exclua alguma antes.`);

  const jpeg = await sharp(arquivo)
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize(LADO_MAXIMO, LADO_MAXIMO, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 86 })
    .toBuffer({ resolveWithObject: true })
    .catch(() => null);
  if (!jpeg) throw new Error("Não consegui abrir essa imagem — mande em JPG ou PNG.");
  return prisma.orcamentoAnexo.create({
    data: {
      orcamentoId,
      nome: nome?.slice(0, 120) || null,
      mime: "image/jpeg",
      bytes: new Uint8Array(jpeg.data),
      largura: jpeg.info.width,
      altura: jpeg.info.height,
      tamanho: TAMANHO_PADRAO,
      ordem: (ultimo?.ordem ?? -1) + 1,
    },
    select: CAMPOS_VM,
  });
}

/** Grava ordem, tamanho e legenda de todas (a lista vem inteira do editor). */
export async function salvarAnexosOrcamento(orcamentoId: string, bruto: unknown): Promise<void> {
  const lista = anexosParaSalvarSchema.parse(bruto);
  await prisma.$transaction(
    lista.map((a, ordem) =>
      prisma.orcamentoAnexo.updateMany({ where: { id: a.id, orcamentoId }, data: { ordem, tamanho: a.tamanho, legenda: a.legenda } }),
    ),
  );
}

export async function excluirAnexoOrcamento(orcamentoId: string, anexoId: string): Promise<void> {
  await prisma.orcamentoAnexo.deleteMany({ where: { id: anexoId, orcamentoId } });
}

export function bytesDoAnexoOrcamento(anexoId: string) {
  return prisma.orcamentoAnexo.findUnique({
    where: { id: anexoId },
    select: { bytes: true, mime: true, orcamento: { select: { tokenPublico: true } } },
  });
}
