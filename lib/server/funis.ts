import "server-only";
import { prisma } from "@/lib/db";

export async function criarFunil(nome: string) {
  const count = await prisma.funil.count();
  return prisma.funil.create({ data: { nome, ordem: count } });
}

export async function criarEtapa(funilId: string, nome: string, slaDias: number | null) {
  const count = await prisma.etapa.count({ where: { funilId } });
  return prisma.etapa.create({ data: { funilId, nome, ordem: count, slaDias } });
}

export function atualizarEtapa(etapaId: string, input: { nome?: string; slaDias?: number | null }) {
  return prisma.etapa.update({ where: { id: etapaId }, data: input });
}

export async function reordenarEtapas(etapaIdsEmOrdem: string[]): Promise<void> {
  await prisma.$transaction(
    etapaIdsEmOrdem.map((id, index) =>
      prisma.etapa.update({ where: { id }, data: { ordem: index } }),
    ),
  );
}
