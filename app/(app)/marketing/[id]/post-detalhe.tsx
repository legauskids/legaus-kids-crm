"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, Download, Loader2, Move, RefreshCw, Sparkles, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  excluirPostagemAction,
  gerarLegendaAction,
  mudarStatusAction,
  salvarLegendaAction,
  salvarTextosAction,
  trocarFotosPorSlideAction,
} from "@/app/(app)/marketing/actions";
import type { ConteudoPostagem, FormatoArte, TextosPostagem } from "@/lib/utils/postagem-arte";
import type { StatusPostagem } from "@prisma/client";
import { AssistentePost, type MensagemAssistente } from "@/app/(app)/marketing/[id]/assistente-post";
import { PublicacaoPost, type ConexaoPublicacaoVM, type PublicacaoVM } from "@/app/(app)/marketing/[id]/publicacao-post";

type ArteVM = { id: string; ordem: number; formato: FormatoArte; versao: number };
type PostVM = {
  id: string;
  numero: number;
  conteudo: ConteudoPostagem;
  status: StatusPostagem;
  legenda: string;
  temLegenda: boolean;
  textos: TextosPostagem;
  artes: ArteVM[];
  publicacao: PublicacaoVM;
};

function urlArte(a: ArteVM, baixar = false) {
  return `/api/imagem/postagem-arte/${a.id}?v=${a.versao}${baixar ? "&baixar=1" : ""}`;
}

/** A arte é desenhada no servidor na primeira vez que abre — mostra "desenhando" até chegar. */
function Arte({ arte, rotulo, postId }: { arte: ArteVM; rotulo: string; postId: string }) {
  const [carregada, setCarregada] = useState(false);
  const story = arte.formato === "STORY";
  return (
    <div className={story ? "w-40 shrink-0 sm:w-48" : "w-56 shrink-0 sm:w-64"}>
      <a href={urlArte(arte)} target="_blank" rel="noreferrer" className={`relative block overflow-hidden rounded-lg border bg-muted ${story ? "aspect-[9/16]" : "aspect-[4/5]"}`}>
        {!carregada && (
          <span className="absolute inset-0 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Desenhando...
          </span>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={urlArte(arte)} alt={rotulo} onLoad={() => setCarregada(true)} className="relative size-full object-cover" />
      </a>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{rotulo}</span>
        <span className="flex items-center gap-2.5">
          <Link href={`/marketing/${postId}/arte/${arte.id}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            <Move className="size-3.5" />
            Ajustar
          </Link>
          <a href={urlArte(arte, true)} className="inline-flex items-center gap-1 hover:text-foreground">
            <Download className="size-3.5" />
            Baixar
          </a>
        </span>
      </div>
    </div>
  );
}

export function PostDetalhe({ post, historico, conexao }: { post: PostVM; historico: MensagemAssistente[]; conexao: ConexaoPublicacaoVM }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [acao, setAcao] = useState<string | null>(null);
  const [legenda, setLegenda] = useState(post.legenda);
  const [titulo1, setTitulo1] = useState(post.textos.titulo[0]);
  const [titulo2, setTitulo2] = useState(post.textos.titulo[1]);
  const [selo1, setSelo1] = useState(post.textos.selos[0] ?? "");
  const [selo2, setSelo2] = useState(post.textos.selos[1] ?? "");
  const [argumentos, setArgumentos] = useState((post.textos.argumentos ?? []).join("\n"));
  const [local, setLocal] = useState(post.textos.local ?? "");

  const feed = post.artes.filter((a) => a.formato === "FEED");
  const stories = post.artes.filter((a) => a.formato === "STORY");
  // Agendado ou com erro ao publicar continua aprovado; publicado (ou saindo agora) não volta pra revisão.
  const aprovado = ["APROVADO", "AGENDADO", "ERRO"].includes(post.status);
  const saiu = post.status === "PUBLICADO" || post.status === "PUBLICANDO";

  function executar(nome: string, fn: () => Promise<{ ok: true } | { ok: false; error: string }>, sucesso?: string, depois?: () => void) {
    setAcao(nome);
    startTransition(async () => {
      const r = await fn();
      setAcao(null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (sucesso) toast.success(sucesso);
      depois?.();
      router.refresh();
    });
  }

  const textosAlterados =
    titulo1 !== post.textos.titulo[0] ||
    titulo2 !== post.textos.titulo[1] ||
    selo1 !== (post.textos.selos[0] ?? "") ||
    selo2 !== (post.textos.selos[1] ?? "") ||
    argumentos !== (post.textos.argumentos ?? []).join("\n") ||
    local !== (post.textos.local ?? "");

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{post.conteudo === "INSTALACAO" || post.conteudo === "TBT" ? "Story" : `Carrossel (${feed.length})`}</h2>
          {post.conteudo === "ENTREGA" && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Fotos por slide:
              {([1, 2] as const).map((n) => (
                <Button
                  key={n}
                  size="sm"
                  variant={(post.textos.fotosPorSlide ?? 2) === n ? "default" : "outline"}
                  disabled={pending || (post.textos.fotosPorSlide ?? 2) === n}
                  onClick={() =>
                    executar(
                      `slides${n}`,
                      () => trocarFotosPorSlideAction(post.id, n),
                      `Slides refeitos com ${n === 1 ? "1 foto" : "2 fotos"} cada — a capa e o story ficaram como estavam.`,
                    )
                  }
                >
                  {acao === `slides${n}` ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {n}
                </Button>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {feed.map((a, i) => (
            <Arte key={a.id} arte={a} postId={post.id} rotulo={i === 0 ? "1 · Capa" : `${i + 1} · Slide`} />
          ))}
          {stories.map((a) => (
            // Com o número: é assim que o assistente chama cada arte ("arte 4").
            <Arte key={a.id} arte={a} postId={post.id} rotulo={post.artes.length > 1 ? `${a.ordem + 1} · Story` : "Story"} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Toque numa arte pra ver em tamanho real, ou em Ajustar pra arrastar título, selos, logo e enquadrar as fotos.</p>
      </section>

      <AssistentePost postId={post.id} historico={historico} temLegenda={post.temLegenda} />

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Textos das artes</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="t1">Título — linha pequena</Label>
              <Input id="t1" value={titulo1} onChange={(e) => setTitulo1(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t2">Título — linha grande</Label>
              <Input id="t2" value={titulo2} onChange={(e) => setTitulo2(e.target.value)} />
            </div>
            {post.conteudo !== "INSTALACAO" && post.conteudo !== "TBT" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="s1">Selo laranja</Label>
                  <Input id="s1" value={selo1} onChange={(e) => setSelo1(e.target.value)} placeholder="Sem selo" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s2">Selo branco</Label>
                  <Input id="s2" value={selo2} onChange={(e) => setSelo2(e.target.value)} placeholder="Sem selo" disabled={Boolean(local.trim())} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="local">Local da obra (selo com pino, no lugar do selo branco)</Label>
                  <Input id="local" value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Ex.: Bob's Vacaria" />
                </div>
              </>
            )}
            {post.conteudo === "BENEFICIOS" && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="arg">Argumentos (um por slide)</Label>
                <Textarea id="arg" value={argumentos} onChange={(e) => setArgumentos(e.target.value)} rows={4} />
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            No máximo 3 informações por imagem: o título e 2 selos. Refazer monta todas as artes de novo no padrão — os ajustes feitos no editor se perdem
            (pra mudar o texto de uma arte só, use Ajustar).
          </p>
          <Button
            variant="outline"
            disabled={pending || !textosAlterados}
            onClick={() =>
              confirm("Refazer todas as artes no padrão? Os ajustes feitos no editor se perdem.") &&
              executar(
                "textos",
                () =>
                  salvarTextosAction(post.id, {
                    titulo: [titulo1, titulo2],
                    selos: [selo1, selo2],
                    preco: post.textos.preco,
                    argumentos: argumentos.split("\n"),
                    local,
                  }),
                "Artes refeitas.",
              )
            }
          >
            {acao === "textos" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Refazer as artes
          </Button>
        </div>

        {post.temLegenda ? (
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold">Legenda</h2>
            <Textarea value={legenda} onChange={(e) => setLegenda(e.target.value)} rows={9} placeholder="A IA não escreveu a legenda — gere de novo ou escreva aqui." />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={pending || legenda === post.legenda} onClick={() => executar("legenda", () => salvarLegendaAction(post.id, legenda), "Legenda salva.")}>
                {acao === "legenda" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Salvar
              </Button>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  executar("ia", async () => {
                    const r = await gerarLegendaAction(post.id);
                    if (r.ok) setLegenda(r.legenda);
                    return r;
                  }, "Nova legenda sugerida.")
                }
              >
                {acao === "ia" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Gerar outra com IA
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(legenda).then(() => toast.success("Legenda copiada."), () => toast.error("Não consegui copiar."));
                }}
              >
                <Copy className="size-4" />
                Copiar
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Story não tem legenda no Instagram — só as artes.</div>
        )}
      </section>

      <PublicacaoPost
        postId={post.id}
        soStory={!post.temLegenda}
        temArtes={post.artes.length > 0}
        legendaPendente={legenda !== post.legenda}
        pub={post.publicacao}
        conexao={conexao}
      />

      <section className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-4">
        {saiu ? null : aprovado ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              (post.status !== "AGENDADO" || confirm("Voltar pra revisão desfaz o agendamento. Continuar?")) &&
              executar("status", () => mudarStatusAction(post.id, "AGUARDANDO_APROVACAO"), "Voltou pra revisão.")
            }
          >
            <Undo2 className="size-4" />
            Voltar pra revisão
          </Button>
        ) : (
          <Button
            disabled={pending || post.artes.length === 0 || legenda !== post.legenda}
            title={legenda !== post.legenda ? "Salve a legenda antes de aprovar" : undefined}
            onClick={() => executar("status", () => mudarStatusAction(post.id, "APROVADO"), "Post aprovado.")}
          >
            <Check className="size-4" />
            Aprovar
          </Button>
        )}
        <Button
          variant="ghost"
          className="text-destructive"
          disabled={pending}
          onClick={() => {
            if (confirm(`Excluir o post #${post.numero} com as fotos e artes?`)) {
              executar("excluir", () => excluirPostagemAction(post.id), "Post excluído.", () => router.push("/marketing"));
            }
          }}
        >
          <Trash2 className="size-4" />
          Excluir
        </Button>
      </section>
    </div>
  );
}
