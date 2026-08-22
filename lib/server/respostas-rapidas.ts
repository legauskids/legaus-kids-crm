import "server-only";
import { prisma } from "@/lib/db";

export function listRespostasRapidas(userId: string) {
  return prisma.respostaRapida.findMany({
    where: { OR: [{ escopo: "COMPARTILHADA" }, { escopo: "PESSOAL", donoId: userId }] },
    orderBy: { titulo: "asc" },
  });
}

export function criarRespostaRapida(input: {
  titulo: string;
  texto: string;
  escopo: "COMPARTILHADA" | "PESSOAL";
  donoId?: string;
}) {
  return prisma.respostaRapida.create({ data: input });
}

export function excluirRespostaRapida(id: string) {
  return prisma.respostaRapida.delete({ where: { id } });
}
