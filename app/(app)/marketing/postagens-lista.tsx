"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, Download, Send, Loader2 } from "lucide-react";
import {
  atualizarLegendaAction,
  atualizarStatusPostagemAction,
  excluirPostagemAction,
} from "@/app/(app)/marketing/actions";
import { TIPO_POSTAGEM_LABEL, STATUS_POSTAGEM_LABEL, type PostagemVM, type StatusPostagem } from "@/app/(app)/marketing/types";

const BADGE_VARIANT: Record<StatusPostagem, "secondary" | "default" | "success" | "destructive"> = {
  RASCUNHO: "secondary",
  AGUARDANDO_APROVACAO: "default",
  APROVADO: "success",
  PUBLICADO: "success",
  RECUSADO: "destructive",
};

function PostagemCard({ postagem }: { postagem: PostagemVM }) {
  const router = useRouter();
  const [legenda, setLegenda] = useState(postagem.legenda ?? "");
  const [pending, startTransition] = useTransition();
  const [salvandoLegenda, startSalvarLegenda] = useTransition();

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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/imagem/postagem/${postagem.id}?v=editada`}
          alt={`Postagem #${postagem.numero}`}
          className="h-56 w-full shrink-0 object-cover sm:h-auto sm:w-48"
        />
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

            <a
              href={`/api/imagem/postagem/${postagem.id}?v=editada`}
              download={`legaus-postagem-${postagem.numero}.jpg`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-muted"
            >
              <Download className="size-3.5" />
              Baixar imagem
            </a>

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
