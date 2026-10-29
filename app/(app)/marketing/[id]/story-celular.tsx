"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Music2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { storyPostadoPeloCelularAction } from "@/app/(app)/marketing/actions";
import type { PublicacaoMeta } from "@/lib/utils/meta-publicacao";
import type { StatusPostagem } from "@prisma/client";

// Story com música do Instagram (pedido de 2026-10-29): a API da Meta não põe
// música, e depois de postado o story não muda. Então o story vai pro
// Instagram do celular pelo compartilhar do aparelho; a música é escolhida lá
// e, de volta aqui, "Já postei" registra pra o CRM não publicar o story de novo.

type StoryVM = { id: string; versao: number };

const APROVADOS: StatusPostagem[] = ["APROVADO", "AGENDADO", "ERRO"];

function urlStory(s: StoryVM) {
  return `/api/imagem/postagem-arte/${s.id}?v=${s.versao}`;
}

/** Celular/tablet com o compartilhar do aparelho (no computador, baixa a imagem). */
function podeCompartilhar(arquivo: File): boolean {
  return typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [arquivo] }) && window.matchMedia("(pointer: coarse)").matches;
}

function baixarLink(href: string, nome: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = nome;
  a.click();
}

function baixar(arquivo: File) {
  const url = URL.createObjectURL(arquivo);
  baixarLink(url, arquivo.name);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function StoryPeloCelular({
  postId,
  numero,
  stories,
  status,
  publicacao,
}: {
  postId: string;
  numero: number;
  stories: StoryVM[];
  status: StatusPostagem;
  publicacao: PublicacaoMeta | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [arquivos, setArquivos] = useState<File[] | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [compartilhou, setCompartilhou] = useState(false);
  const aprovado = APROVADOS.includes(status);
  const jaSaiu = Boolean(publicacao?.instagram?.storyPeloCelularEm) || (publicacao?.instagram?.storyIds?.length ?? 0) >= stories.length;

  // O compartilhar do celular precisa abrir no mesmo toque (o iPhone recusa se
  // esperar o download): as imagens já vêm carregadas antes.
  const urls = stories.map(urlStory).join(" ");
  useEffect(() => {
    const lista = urls.split(" ").filter(Boolean);
    if (!aprovado || jaSaiu || lista.length === 0) return;
    let ativo = true;
    Promise.all(
      lista.map(async (url, i) => {
        const r = await fetch(url);
        if (!r.ok) throw new Error(String(r.status));
        return new File([await r.blob()], `legaus-story-${numero}${lista.length > 1 ? `-${i + 1}` : ""}.jpg`, { type: "image/jpeg" });
      }),
    )
      .then((arquivosProntos) => ativo && setArquivos(arquivosProntos))
      .catch(() => ativo && setFalhou(true));
    return () => {
      ativo = false;
    };
  }, [aprovado, jaSaiu, urls, numero]);

  if (stories.length === 0 || status === "PUBLICANDO" || (status === "PUBLICADO" && !publicacao?.instagram?.storyPeloCelularEm)) return null;

  async function compartilhar(i: number) {
    const arquivo = arquivos?.[i];
    if (!arquivo) {
      // Não deu pra preparar a imagem antes: pelo menos baixa.
      baixarLink(`${urlStory(stories[i])}&baixar=1`, `legaus-story-${numero}.jpg`);
      setCompartilhou(true);
      return;
    }
    if (!podeCompartilhar(arquivo)) {
      baixar(arquivo);
      toast.success("Imagem baixada. No celular, esse botão abre direto o Instagram.");
      setCompartilhou(true);
      return;
    }
    try {
      await navigator.share({ files: [arquivo] });
      setCompartilhou(true);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error("O celular não abriu o compartilhar — baixe a imagem e poste pelo Instagram.");
      baixar(arquivo);
    }
  }

  function jaPostei() {
    startTransition(async () => {
      const r = await storyPostadoPeloCelularAction(postId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.terminou ? "Story registrado — post marcado como publicado." : "Story registrado — o CRM publica só o resto do post.");
      router.refresh();
    });
  }

  let corpo: React.ReactNode;
  if (jaSaiu) {
    const quando = publicacao?.instagram?.storyPeloCelularEm;
    corpo = (
      <p className="flex items-center gap-2 text-sm">
        <CheckCircle2 className="size-4 text-success" />
        {quando
          ? `Story postado pelo celular em ${new Date(quando).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.`
          : "O story já foi publicado pelo CRM."}
      </p>
    );
  } else if (!aprovado) {
    corpo = <p className="text-sm text-muted-foreground">Aprove o post (botão lá embaixo) pra poder postar o story pelo celular.</p>;
  } else {
    corpo = (
      <div className="space-y-3">
        <ol className="list-decimal space-y-0.5 pl-5 text-sm text-muted-foreground">
          <li>
            No celular, toque em <b className="text-foreground">Postar pelo celular</b> e escolha <b className="text-foreground">Instagram → Story</b>.
          </li>
          <li>
            No Instagram, toque na figurinha <span aria-hidden>🙂</span> → <b className="text-foreground">Música</b>, escolha a música e publique.
          </li>
          <li>
            Volte aqui e toque em <b className="text-foreground">Já postei</b>, pra o CRM não publicar o story de novo.
          </li>
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          {stories.map((s, i) => (
            <Button key={s.id} disabled={(!arquivos && !falhou) || pending} onClick={() => compartilhar(i)} variant={compartilhou ? "outline" : "default"}>
              {arquivos || falhou ? <Smartphone className="size-4" /> : <Loader2 className="size-4 animate-spin" />}
              {stories.length > 1 ? `Postar story ${i + 1} pelo celular` : "Postar pelo celular"}
            </Button>
          ))}
          <Button variant={compartilhou ? "default" : "outline"} disabled={pending} onClick={jaPostei}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            Já postei
          </Button>
        </div>
        {falhou && <p className="text-xs text-destructive">Não consegui preparar a imagem pro compartilhar — o botão baixa a imagem (ou recarregue a página).</p>}
        {status === "AGENDADO" && <p className="text-xs text-muted-foreground">Está agendado: ao marcar Já postei, o CRM não publica mais o story no horário.</p>}
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Music2 className="size-4 text-primary" />
        Story com música, pelo celular
      </h2>
      {corpo}
    </section>
  );
}
