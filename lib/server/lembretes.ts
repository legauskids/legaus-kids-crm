import "server-only";
import { prisma } from "@/lib/db";

export function getLembretesNaoLidos(userId: string) {
  return prisma.lembrete.findMany({
    where: { paraUsuarioId: userId, lido: false },
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
