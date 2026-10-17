import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireModulo } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { NovoPostForm } from "@/app/(app)/marketing/novo/novo-post-form";

// Montar as artes e pedir a legenda à IA (olhando as fotos) leva alguns
// segundos — vale pras ações chamadas desta tela.
export const maxDuration = 60;

export default async function NovoPostPage() {
  await requireModulo("marketing");
  const negocios = await prisma.negocio.findMany({
    orderBy: { updatedAt: "desc" },
    take: 150,
    select: { id: true, titulo: true, contato: { select: { nome: true, cidade: true } } },
  });

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b bg-card px-4 py-3.5 shadow-xs sm:px-6">
        <Link href="/marketing" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          Marketing
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Novo post</h1>
        <p className="text-sm text-muted-foreground">Só fotos reais da obra, da montagem, da fábrica ou do produto.</p>
      </div>
      <NovoPostForm negocios={negocios.map((n) => ({ id: n.id, titulo: n.titulo, cliente: n.contato?.nome ?? null, cidade: n.contato?.cidade ?? null }))} />
    </div>
  );
}
