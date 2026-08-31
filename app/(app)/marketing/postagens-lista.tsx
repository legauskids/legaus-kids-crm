"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Check, X, Download, Send, Loader2, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import {
  atualizarLegendaAction,
  atualizarStatusPostagemAction,
  excluirPostagemAction,
  definirVarianteEscolhidaAction,
  editarImagemComIAAction,
} from "@/app/(app)/marketing/actions";
import {
  TIPO_POSTAGEM_LABEL,
  STATUS_POSTAGEM_LABEL,
  LAYOUT_VARIANTE_LABEL,
  type PostagemVM,
  type StatusPostagem,
} from "@/app/(app)/marketing/types";

const BADGE_VARIANT: Record<StatusPostagem, "secondary" | "default" | "success" | "destructive"> = {
  RASCUNHO: "secondary",
  AGUARDANDO_APROVACAO: "default",
  APROVADO: "success",
  PUBLICADO: "success",
  RECUSADO: "destructive",
};

function ImagemDaPostagem({ imagem }: { imagem: PostagemVM["imagens"][number] }) {
  const router = useRouter();
  const [pendingVariante, startVariante] = useTransition();
  const [editando, setEditando] = useState(false);
  const [instrucao, setInstrucao] = useState("");
  const [erroIA, setErroIA] = useState<string | null>(null);
  const [salvandoIA, startSalvarIA] = useTransition();

  const escolhida = imagem.variantes.find((v) => v.escolhida) ?? imagem.variantes[0];

  function escolherVariante(varianteId: string) {
    if (varianteId === escolhida?.id) return;
    startVariante(async () => {
      await definirVarianteEscolhidaAction(imagem.id, varianteId);
      router.refresh();
    });
  }

  function editarComIA() {
    setErroIA(null);
    startSalvarIA(async () => {
      const resultado = await editarImagemComIAAction(imagem.id, instrucao);
      if (resultado.error) {
        setErroIA(resultado.error);
        return;
      }
      setInstrucao("");
      setEditando(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg border bg-muted/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/imagem/postagem-variante/${escolhida?.id}`}
          alt="Prévia da postagem"
          className="aspect-4/5 w-full object-cover"
        />
        {pendingVariante && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Loader2 className="size-6 animate-spin text-white" />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {imagem.variantes.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => escolherVariante(v.id)}
            className={`overflow-hidden rounded-md border-2 transition-colors ${
              v.id === escolhida?.id ? "border-primary" : "border-transparent hover:border-border"
            }`}
            title={LAYOUT_VARIANTE_LABEL[v.layout]}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/imagem/postagem-variante/${v.id}`} alt={LAYOUT_VARIANTE_LABEL[v.layout]} className="h-16 w-16 object-cover" />
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">Layout: {escolhida ? LAYOUT_VARIANTE_LABEL[escolhida.layout] : "—"}</p>

      {!editando ? (
        <Button size="sm" variant="outline" className="w-full" onClick={() => setEditando(true)}>
          <Sparkles className="size-3.5" />
          Editar com IA
        </Button>
      ) : (
        <div className="space-y-1.5 rounded-md border bg-muted/30 p-2">
          <Input
            value={instrucao}
            onChange={(e) => setInstrucao(e.target.value)}
            placeholder="ex: melhorar a qualidade, remover a pessoa do fundo..."
            className="h-8 text-xs"
          />
          {erroIA && <p className="text-[11px] text-destructive">{erroIA}</p>}
          <div className="flex gap-1.5">
            <Button size="sm" className="h-7 flex-1 text-xs" disabled={salvandoIA || !instrucao.trim()} onClick={editarComIA}>
              {salvandoIA ? <Loader2 className="size-3.5 animate-spin" /> : "Aplicar"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={salvandoIA}
              onClick={() => {
                setEditando(false);
                setErroIA(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PostagemCard({ postagem }: { postagem: PostagemVM }) {
  const router = useRouter();
  const [legenda, setLegenda] = useState(postagem.legenda ?? "");
  const [indiceAtual, setIndiceAtual] = useState(0);
  const [pending, startTransition] = useTransition();
  const [salvandoLegenda, startSalvarLegenda] = useTransition();

  const imagemAtual = postagem.imagens[indiceAtual] ?? postagem.imagens[0];
  const varianteEscolhidaAtual = imagemAtual?.variantes.find((v) => v.escolhida) ?? imagemAtual?.variantes[0];

  function mudarStatus(status: StatusPostagem) {
    startTransition(async () => {
      await atualizarStatusPostagemAction(postagem.id, status);
      router.refresh();
    });
  }

  function salvarLegenda() {
    startSalvarLegenda(async () => {
      await atualizarLegendaAction(postagem.id, legenda);
      router.refresh();
    });
  }

  function excluir() {
    startTransition(async () => {
      await excluirPostagemAction(postagem.id);
      router.refresh();
    });
  }

  return (
    <Card className="overflow-hidden py-0">
      <div className="flex flex-col sm:flex-row">
        <div className="relative w-full shrink-0 sm:w-64">
          {postagem.imagens.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setIndiceAtual((i) => (i === 0 ? postagem.imagens.length - 1 : i - 1))}
                className="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setIndiceAtual((i) => (i === postagem.imagens.length - 1 ? 0 : i + 1))}
                className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
              >
                <ChevronRight className="size-4" />
              </button>
              <span className="absolute bottom-1.5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white">
                {indiceAtual + 1} / {postagem.imagens.length}
              </span>
            </>
          )}
          <div className="p-3">{imagemAtual && <ImagemDaPostagem imagem={imagemAtual} />}</div>
        </div>
        <CardContent className="flex-1 space-y-2.5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">#{String(postagem.numero).padStart(4, "0")}</span>
            <Badge variant="outline" className="text-[10px]">
              {TIPO_POSTAGEM_LABEL[postagem.tipo]}
            </Badge>
            <Badge variant={BADGE_VARIANT[postagem.status]} className="text-[10px]">
              {STATUS_POSTAGEM_LABEL[postagem.status]}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {postagem.criadoPorNome} · {new Date(postagem.criadoEm).toLocaleDateString("pt-BR")}
            </span>
          </div>

          {postagem.contexto && <p className="text-xs text-muted-foreground">{postagem.contexto}</p>}

          <Textarea value={legenda} onChange={(e) => setLegenda(e.target.value)} rows={3} className="text-sm" placeholder="Legenda..." />
          <div className="flex flex-wrap items-center gap-2">
            {legenda !== (postagem.legenda ?? "") && (
              <Button size="sm" variant="outline" disabled={salvandoLegenda} onClick={salvarLegenda}>
                {salvandoLegenda ? <Loader2 className="size-3.5 animate-spin" /> : "Salvar legenda"}
              </Button>
            )}

            {varianteEscolhidaAtual && (
              <a
                href={`/api/imagem/postagem-variante/${varianteEscolhidaAtual.id}`}
                download={`legaus-postagem-${postagem.numero}-${indiceAtual + 1}.jpg`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-muted"
              >
                <Download className="size-3.5" />
                Baixar imagem
              </a>
            )}

            {postagem.status === "AGUARDANDO_APROVACAO" && (
              <>
                <Button size="sm" disabled={pending} onClick={() => mudarStatus("APROVADO")}>
                  <Check className="size-3.5" />
                  Aprovar
                </Button>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => mudarStatus("RECUSADO")}>
                  <X className="size-3.5" />
                  Recusar
                </Button>
              </>
            )}
            {postagem.status === "APROVADO" && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => mudarStatus("PUBLICADO")}>
                <Send className="size-3.5" />
                Marcar como publicado
              </Button>
            )}
            {(postagem.status === "RECUSADO" || postagem.status === "RASCUNHO") && (
              <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={excluir}>
                Excluir
              </Button>
            )}
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

export function PostagensLista({ postagens }: { postagens: PostagemVM[] }) {
  if (postagens.length === 0) {
    return (
      <div className="flex-1 p-6">
        <p className="text-sm text-muted-foreground">Nenhuma postagem ainda — envie uma foto na aba &quot;Nova postagem&quot;.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-3 p-6">
      {postagens.map((p) => (
        <PostagemCard key={p.id} postagem={p} />
      ))}
    </div>
  );
}
