import "server-only";
import { prisma } from "@/lib/db";

export function listCatalogos() {
  return prisma.catalogo.findMany({ orderBy: { nome: "asc" } });
}
