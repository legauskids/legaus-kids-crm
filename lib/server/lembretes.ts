import "server-only";
import { prisma } from "@/lib/db";

/** Só traz lembretes sem horário definido ou cujo horário já chegou — é isso que faz o sininho "notificar no horário escolhido". */
export function getLembretesNaoLidos(userId: string) {
  return prisma.lembrete.findMany({
    where: {
      paraUsuarioId: userId,
      lido: false,
      OR: [{ notificarEm: null }, { notificarEm: { lte: new Date() } }],
    },
    orderBy: { criadoEm: "desc" },
    take: 20,
  });
}

export async function marcarLembreteLido(lembreteId: string): Promise<void> {
  await prisma.lembrete.update({
    where: { id: lembreteId },
    data: { lido: true },
  });
}

export function criarLembrete(input: {
  paraUsuarioId: string;
  nome: string;
  descricao?: string;
  notificarEm?: Date;
}) {
  return prisma.lembrete.create({ data: input });
}
