"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Music2, Pause, Play, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { excluirMusicaAction } from "@/app/(app)/marketing/actions";
import { cortarTrecho, duracaoDoArquivo } from "@/app/(app)/marketing/musicas/cortar-trecho";
import { DURACAO_TRECHO_S, inicioMaximo, mmss } from "@/lib/utils/musicas-story";

type MusicaVM = { id: string; titulo: string; artista: string | null; fonte: string; duracaoSeg: number; postsPendentes: number };

function nomeSemExtensao(nome: string) {
  return nome.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 120);
}

/** Escolher o arquivo, achar o trecho de 15 s ouvindo, e guardar com nome e de onde veio. */
function GuardarMusica() {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const pararRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [duracao, setDuracao] = useState<number | null>(null);
  const [inicio, setInicio] = useState(0);
  const [titulo, setTitulo] = useState("");
  const [artista, setArtista] = useState("");
  const [fonte, setFonte] = useState("");
  const [abrindo, setAbrindo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [tocando, setTocando] = useState(false);

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  function pararTrecho() {
    if (pararRef.current) clearTimeout(pararRef.current);
    pararRef.current = null;
    audioRef.current?.pause();
    setTocando(false);
  }

  function ouvirTrecho(de = inicio) {
    const audio = audioRef.current;
    if (!audio) return;
    pararTrecho();
    audio.currentTime = de;
    void audio.play().then(() => {
      setTocando(true);
      pararRef.current = setTimeout(pararTrecho, DURACAO_TRECHO_S * 1000);
    });
  }

  async function escolher(novo: File | undefined) {
    pararTrecho();
    setArquivo(null);
    setDuracao(null);
    setInicio(0);
    if (!novo) return;
    setAbrindo(true);
    try {
      const segundos = await duracaoDoArquivo(novo);
      setArquivo(novo);
      setUrl(URL.createObjectURL(novo));
      setDuracao(segundos);
      setTitulo((t) => t || nomeSemExtensao(novo.name));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui abrir esse arquivo.");
    } finally {
      setAbrindo(false);
    }
  }

  async function guardar() {
    if (!arquivo) return;
    pararTrecho();
    setEnviando(true);
    try {
      const trecho = await cortarTrecho(arquivo, inicio);
      const form = new FormData();
      form.set("trecho", trecho, "trecho.wav");
      form.set("titulo", titulo);
      form.set("artista", artista);
      form.set("fonte", fonte);
      const r = await fetch("/api/marketing/musicas", { method: "POST", body: form });
      const resposta = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(resposta.error ?? "Não consegui guardar a música.");
      toast.success("Música guardada — já dá pra escolher no story dos posts.");
      setArquivo(null);
      setUrl(null);
      setDuracao(null);
      setInicio(0);
      setTitulo("");
      setArtista("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui guardar a música.");
    } finally {
      setEnviando(false);
    }
  }

  const maximo = duracao !== null ? inicioMaximo(duracao) : 0;
  const fim = duracao !== null ? Math.min(duracao, inicio + DURACAO_TRECHO_S) : 0;

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold">Guardar música</h2>
      <div className="space-y-1.5">
        <Label htmlFor="arquivo-musica">Arquivo da música (MP3, M4A ou WAV)</Label>
        <Input id="arquivo-musica" type="file" accept="audio/*" disabled={abrindo || enviando} onChange={(e) => void escolher(e.target.files?.[0])} />
        {abrindo && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Abrindo a música...
          </p>
        )}
      </div>

      {arquivo && url && duracao !== null && (
        <>
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="inicio-trecho">
                Trecho: <span className="tabular-nums">{mmss(inicio)}</span> a <span className="tabular-nums">{mmss(fim)}</span>
                <span className="font-normal text-muted-foreground"> (a música tem {mmss(duracao)})</span>
              </Label>
              <Button size="sm" variant="outline" onClick={() => (tocando ? pararTrecho() : ouvirTrecho())}>
                {tocando ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                {tocando ? "Parar" : "Ouvir o trecho"}
              </Button>
            </div>
            <input
              id="inicio-trecho"
              type="range"
              min={0}
              max={maximo}
              step={1}
              value={inicio}
              disabled={maximo === 0}
              onChange={(e) => {
                const novo = Number(e.target.value);
                setInicio(novo);
                if (tocando) ouvirTrecho(novo);
              }}
              className="w-full accent-primary"
            />
            <p className="text-xs text-muted-foreground">Arraste pra escolher onde começa. O trecho entra com fade no começo e no fim.</p>
            <audio ref={audioRef} src={url} preload="auto" onPause={() => setTocando(false)} className="hidden" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="titulo-musica">Nome da música</Label>
              <Input id="titulo-musica" value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="artista-musica">Artista (opcional)</Label>
              <Input id="artista-musica" value={artista} maxLength={120} onChange={(e) => setArtista(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="fonte-musica">De onde veio (licença)</Label>
              <Input
                id="fonte-musica"
                value={fonte}
                maxLength={200}
                onChange={(e) => setFonte(e.target.value)}
                placeholder="Ex.: Pixabay Music — uso comercial livre"
              />
            </div>
          </div>
          <Button disabled={enviando || !titulo.trim() || !fonte.trim()} onClick={() => void guardar()}>
            {enviando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Guardar música
          </Button>
        </>
      )}
    </section>
  );
}

function LinhaMusica({ m }: { m: MusicaVM }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <li className="space-y-2 rounded-xl border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {m.titulo}
            {m.artista ? <span className="font-normal text-muted-foreground"> · {m.artista}</span> : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {m.fonte} · {Math.round(m.duracaoSeg)} s{m.postsPendentes > 0 ? ` · em ${m.postsPendentes} post${m.postsPendentes > 1 ? "s" : ""} ainda não publicado${m.postsPendentes > 1 ? "s" : ""}` : ""}
          </p>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          className="shrink-0 text-destructive"
          title="Excluir a música"
          disabled={pending}
          onClick={() =>
            confirm(`Excluir a música "${m.titulo}"?`) &&
            startTransition(async () => {
              const r = await excluirMusicaAction(m.id);
              if (!r.ok) toast.error(r.error);
              else {
                toast.success("Música excluída.");
                router.refresh();
              }
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        </Button>
      </div>
      <audio controls preload="none" src={`/api/marketing/musicas/${m.id}/audio`} className="h-9 w-full" />
    </li>
  );
}

export function MusicasStory({ musicas }: { musicas: MusicaVM[] }) {
  return (
    <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <p className="font-medium">Só música livre de direitos pra uso comercial</p>
          <p className="mt-1 text-muted-foreground">
            Por exemplo, as do Pixabay Music (pixabay.com/music) ou da Biblioteca de áudio do YouTube. Música famosa pode ser silenciada ou derrubada pelo
            Instagram. Pra usar as músicas do próprio Instagram, poste o story pelo celular (botão na tela do post).
          </p>
        </div>
        <GuardarMusica />
      </div>
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Music2 className="size-4 text-primary" />
          Guardadas ({musicas.length})
        </h2>
        {musicas.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma música guardada ainda.</p>
        ) : (
          <ul className="space-y-2">
            {musicas.map((m) => (
              <LinhaMusica key={m.id} m={m} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
