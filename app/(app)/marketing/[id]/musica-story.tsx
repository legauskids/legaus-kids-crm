"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Music2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { escolherMusicaAction } from "@/app/(app)/marketing/actions";
import type { StatusPostagem } from "@prisma/client";

// Música do story que o CRM publica sozinho (pedido de 2026-10-29): com
// música, o story sai como vídeo de até 15 s (a arte parada + o trecho).
// Biblioteca em /marketing/musicas.

export type MusicaOpcaoVM = { id: string; titulo: string; artista: string | null };
export type PreviaVideoVM = { arteId: string; url: string; poster: string };

const SEM_MUSICA = "sem";

export function MusicaDoStory({
  postId,
  status,
  musicas,
  musicaId,
  previas,
}: {
  postId: string;
  status: StatusPostagem;
  musicas: MusicaOpcaoVM[];
  musicaId: string | null;
  previas: PreviaVideoVM[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const aprovado = status === "APROVADO" || status === "AGENDADO";

  function trocar(valor: string) {
    const nova = valor === SEM_MUSICA ? null : valor;
    if (nova === musicaId) return;
    if (aprovado && !confirm(`Trocar a música muda o que vai pro ar: o post volta pra revisão${status === "AGENDADO" ? " e o agendamento é desfeito" : ""}. Continuar?`)) return;
    startTransition(async () => {
      const r = await escolherMusicaAction(postId, nova);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${nova ? "Música escolhida" : "Música tirada"}${r.voltouPraRevisao ? " — o post voltou pra revisão." : "."}`);
      router.refresh();
    });
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Music2 className="size-4 text-primary" />
        Música no story publicado pelo CRM
      </h2>
      {musicas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma música guardada ainda.{" "}
          <Link href="/marketing/musicas" className="font-medium text-primary hover:underline">
            Guardar músicas
          </Link>
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1 space-y-1.5 sm:max-w-sm">
              <Label htmlFor="musica-story">Música</Label>
              <Select value={musicaId ?? SEM_MUSICA} onValueChange={trocar} disabled={pending}>
                <SelectTrigger id="musica-story" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_MUSICA}>Sem música (story só com a imagem)</SelectItem>
                  {musicas.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.titulo}
                      {m.artista ? ` · ${m.artista}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {pending && <Loader2 className="mb-2 size-4 animate-spin text-muted-foreground" />}
            <Link href="/marketing/musicas" className="mb-2 text-sm font-medium text-primary hover:underline">
              Músicas guardadas
            </Link>
          </div>
          {musicaId && previas.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex gap-3 overflow-x-auto pb-1">
                {previas.map((p) => (
                  <video key={p.url} controls playsInline preload="none" poster={p.poster} src={p.url} className="aspect-[9/16] w-40 shrink-0 rounded-lg border bg-black sm:w-48" />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Prévia do story com a música — a primeira vez leva alguns segundos pra montar.</p>
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Com música, o story sai como vídeo de 15 s. Só use música livre de direitos (música famosa pode ser silenciada pelo Instagram). Pra usar uma música do
        próprio Instagram, poste pelo celular (abaixo).
      </p>
    </section>
  );
}
