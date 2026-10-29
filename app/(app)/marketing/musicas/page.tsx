import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireModulo } from "@/lib/auth/guards";
import { listarMusicas } from "@/lib/server/musicas-story";
import { MusicasStory } from "@/app/(app)/marketing/musicas/musicas-story";

export default async function MusicasPage() {
  await requireModulo("marketing");
  const musicas = await listarMusicas();

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b bg-card px-4 py-3.5 shadow-xs sm:px-6">
        <Link href="/marketing" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          Marketing
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Músicas dos stories</h1>
        <p className="text-sm text-muted-foreground">Trechos de 15 s que o CRM coloca no story quando publica sozinho (o story sai como vídeo).</p>
      </div>
      <MusicasStory
        musicas={musicas.map((m) => ({
          id: m.id,
          titulo: m.titulo,
          artista: m.artista,
          fonte: m.fonte,
          duracaoSeg: m.duracaoSeg,
          postsPendentes: m._count.postagens,
        }))}
      />
    </div>
  );
}
