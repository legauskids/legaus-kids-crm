import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireModulo } from "@/lib/auth/guards";
import { buscarPostagem, SO_STORY, textosDaPostagem } from "@/lib/server/marketing";
import { Badge } from "@/components/ui/badge";
import { ROTULO_CONTEUDO } from "@/lib/utils/postagem-arte";
import { ROTULO_STATUS_POSTAGEM, VARIANTE_STATUS_POSTAGEM } from "@/app/(app)/marketing/rotulos";
import { PostDetalhe } from "@/app/(app)/marketing/[id]/post-detalhe";

// Refazer as artes e pedir outra legenda à IA levam alguns segundos.
export const maxDuration = 60;

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModulo("marketing");
  const { id } = await params;
  const p = await buscarPostagem(id);
  if (!p) notFound();

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b bg-card px-4 py-3.5 shadow-xs sm:px-6">
        <Link href="/marketing" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          Marketing
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Post #{p.numero} · {ROTULO_CONTEUDO[p.conteudo]}
          </h1>
          <Badge variant={VARIANTE_STATUS_POSTAGEM[p.status]}>{ROTULO_STATUS_POSTAGEM[p.status]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {[p.produto, p.cliente, p.cidade, p.negocio?.titulo].filter(Boolean).join(" · ") || "Sem cliente informado"} · criado por {p.criadoPor.nome} em{" "}
          {p.criadoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
        </p>
      </div>
      <PostDetalhe
        post={{
          id: p.id,
          numero: p.numero,
          conteudo: p.conteudo,
          status: p.status,
          legenda: p.legenda ?? "",
          temLegenda: !SO_STORY.includes(p.conteudo),
          textos: textosDaPostagem(p),
          artes: p.artes.map((a) => ({ id: a.id, ordem: a.ordem, formato: a.formato, versao: a.atualizadoEm.getTime() })),
        }}
      />
    </div>
  );
}
