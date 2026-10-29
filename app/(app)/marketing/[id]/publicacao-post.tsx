"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, CheckCircle2, ExternalLink, Loader2, RotateCcw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { agendarPostagemAction, cancelarAgendamentoAction, publicarAgoraAction } from "@/app/(app)/marketing/actions";
import type { PublicacaoMeta } from "@/lib/utils/meta-publicacao";
import type { StatusPostagem } from "@prisma/client";

export type PublicacaoVM = {
  status: StatusPostagem;
  agendadaPara: string | null;
  publicadaEm: string | null;
  publicarNoInstagram: boolean;
  publicarNoFacebook: boolean;
  publicacao: PublicacaoMeta | null;
  erroPublicacao: string | null;
};

export type ConexaoPublicacaoVM = { paginaNome: string; instagramUsuario: string | null; temInstagram: boolean; podeFacebook: boolean; erro: string | null } | null;

const FUSO = { timeZone: "America/Sao_Paulo" } as const;

function dataHoraTexto(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { ...FUSO, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** ISO → valor do <input type="datetime-local"> no horário de Brasília (-03:00 fixo, como em dataHoraDoFormulario). */
function paraInput(iso: string | null) {
  return iso ? new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 16) : "";
}

function LinksPublicados({ publicacao }: { publicacao: PublicacaoMeta | null }) {
  const ig = publicacao?.instagram;
  const fb = publicacao?.facebook;
  if (!ig?.feedId && !ig?.storyIds?.length && !ig?.storyPeloCelularEm && !fb?.postId) return null;
  return (
    <ul className="space-y-1 text-sm">
      {ig?.feedId && (
        <li className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-success" />
          Feed do Instagram
          {ig.feedLink && (
            <a href={ig.feedLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              ver <ExternalLink className="size-3.5" />
            </a>
          )}
        </li>
      )}
      {Boolean(ig?.storyIds?.length) && (
        <li className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-success" />
          Story do Instagram{(ig?.storyIds?.length ?? 0) > 1 ? ` (${ig?.storyIds?.length})` : ""}
        </li>
      )}
      {ig?.storyPeloCelularEm && !ig.storyIds?.length && (
        <li className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-success" />
          Story do Instagram (postado pelo celular)
        </li>
      )}
      {fb?.postId && (
        <li className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-success" />
          Página do Facebook
          {fb.link && (
            <a href={fb.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              ver <ExternalLink className="size-3.5" />
            </a>
          )}
        </li>
      )}
    </ul>
  );
}

/** Publicar agora / agendar no Instagram e na Página do Facebook (etapa 3 dos posts). */
export function PublicacaoPost({
  postId,
  soStory,
  temArtes,
  legendaPendente,
  pub,
  conexao,
}: {
  postId: string;
  soStory: boolean;
  temArtes: boolean;
  legendaPendente: boolean;
  pub: PublicacaoVM;
  conexao: ConexaoPublicacaoVM;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [acao, setAcao] = useState<string | null>(null);
  const podeInstagram = Boolean(conexao?.temInstagram);
  const podeFacebook = Boolean(conexao?.podeFacebook) && !soStory;
  const [instagram, setInstagram] = useState(podeInstagram && pub.publicarNoInstagram);
  const [facebook, setFacebook] = useState(podeFacebook && pub.publicarNoFacebook);
  const [quando, setQuando] = useState(paraInput(pub.agendadaPara));

  // Publicando em segundo plano: a tela se atualiza sozinha até terminar.
  useEffect(() => {
    if (pub.status !== "PUBLICANDO") return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [pub.status, router]);

  function executar(nome: string, fn: () => Promise<{ ok: true } | { ok: false; error: string }>, sucesso: string) {
    setAcao(nome);
    startTransition(async () => {
      const r = await fn();
      setAcao(null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(sucesso);
      router.refresh();
    });
  }

  const destinos = { instagram, facebook };
  const nomesDestinos = [instagram && "Instagram", facebook && "Facebook"].filter(Boolean).join(" e ");
  const podePublicar = ["APROVADO", "AGENDADO", "ERRO"].includes(pub.status);

  let corpo: React.ReactNode;
  if (pub.status === "PUBLICANDO") {
    corpo = (
      <p className="flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Publicando... leva cerca de 1 minuto. Você recebe o aviso no Telegram quando terminar.
      </p>
    );
  } else if (pub.status === "PUBLICADO") {
    corpo = (
      <div className="space-y-2">
        <p className="text-sm font-medium">Publicado{pub.publicadaEm ? ` em ${dataHoraTexto(pub.publicadaEm)}` : ""}.</p>
        <LinksPublicados publicacao={pub.publicacao} />
        {pub.erroPublicacao && <p className="text-xs text-muted-foreground">Observação: {pub.erroPublicacao}</p>}
      </div>
    );
  } else if (!podePublicar) {
    corpo = <p className="text-sm text-muted-foreground">Aprove o post (botão lá embaixo) pra poder publicar ou agendar.</p>;
  } else if (!conexao) {
    corpo = (
      <p className="text-sm text-muted-foreground">
        O CRM ainda não está conectado ao Instagram e ao Facebook da Legaus.{" "}
        <Link href="/configuracoes?aba=meta" className="font-medium text-primary hover:underline">
          Conectar em Configurações
        </Link>
        .
      </p>
    );
  } else {
    corpo = (
      <div className="space-y-4">
        {pub.status === "ERRO" && (
          <div className="space-y-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{pub.erroPublicacao ?? "A publicação não terminou."}</span>
            </p>
            <p className="text-xs">Tentar de novo só refaz o que falhou — o que já saiu não é publicado duas vezes.</p>
          </div>
        )}
        {pub.status === "ERRO" && <LinksPublicados publicacao={pub.publicacao} />}
        {pub.status === "AGENDADO" && pub.agendadaPara && (
          <p className="flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="size-4 text-primary" />
            Agendado para {dataHoraTexto(pub.agendadaPara)} ({[pub.publicarNoInstagram && podeInstagram && "Instagram", pub.publicarNoFacebook && podeFacebook && "Facebook"].filter(Boolean).join(" e ")}).
          </p>
        )}
        {conexao.erro && <p className="text-sm text-destructive">A última verificação da conexão falhou: {conexao.erro}</p>}
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <label className={`flex items-center gap-2 ${podeInstagram ? "" : "opacity-50"}`}>
            <Checkbox checked={instagram} disabled={!podeInstagram || pending} onCheckedChange={(v) => setInstagram(v === true)} />
            Instagram {conexao.instagramUsuario ? `(@${conexao.instagramUsuario})` : "(a Página não tem Instagram ligado)"}
            {soStory ? " — story" : ""}
          </label>
          <label className={`flex items-center gap-2 ${podeFacebook ? "" : "opacity-50"}`}>
            <Checkbox checked={facebook} disabled={!podeFacebook || pending} onCheckedChange={(v) => setFacebook(v === true)} />
            Facebook ({conexao.paginaNome})
            {soStory ? " — story não vai pra Página" : !conexao.podeFacebook ? " — falta a permissão pages_manage_posts" : ""}
          </label>
        </div>
        {legendaPendente && <p className="text-sm text-destructive">Salve a legenda antes de publicar.</p>}
        <div className="flex flex-wrap items-end gap-3">
          <Button
            disabled={pending || !temArtes || legendaPendente || (!instagram && !facebook)}
            onClick={() =>
              confirm(`Publicar agora no ${nomesDestinos}?`) &&
              executar("agora", () => publicarAgoraAction(postId, destinos), "Publicando — a tela atualiza sozinha.")
            }
          >
            {acao === "agora" ? <Loader2 className="size-4 animate-spin" /> : pub.status === "ERRO" ? <RotateCcw className="size-4" /> : <Send className="size-4" />}
            {pub.status === "ERRO" ? "Tentar de novo agora" : "Publicar agora"}
          </Button>
          <div className="space-y-1">
            <Label htmlFor="agendar-para" className="text-xs text-muted-foreground">
              Ou agendar para (horário de Brasília)
            </Label>
            <div className="flex gap-2">
              <Input id="agendar-para" type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} className="h-9 w-52" disabled={pending} />
              <Button
                variant="outline"
                disabled={pending || !quando || !temArtes || legendaPendente || (!instagram && !facebook)}
                onClick={() =>
                  executar(
                    "agendar",
                    () => agendarPostagemAction(postId, quando, destinos),
                    `Agendado para ${dataHoraTexto(`${quando}:00-03:00`)} no ${nomesDestinos}.`,
                  )
                }
              >
                {acao === "agendar" ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />}
                {pub.status === "AGENDADO" ? "Mudar horário" : "Agendar"}
              </Button>
            </div>
          </div>
          {pub.status === "AGENDADO" && (
            <Button variant="ghost" disabled={pending} onClick={() => executar("cancelar", () => cancelarAgendamentoAction(postId), "Agendamento cancelado — o post continua aprovado.")}>
              {acao === "cancelar" ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
              Cancelar agendamento
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {soStory
            ? "Sai como story no Instagram."
            : "No Instagram sai o carrossel (até 10 imagens) com a legenda, e o story junto (se o post tiver). Na Página do Facebook sai um post com as mesmas imagens e a legenda."}{" "}
          Se mexer nas artes ou nos textos depois de agendar, o post volta pra revisão e o agendamento é desfeito.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold">Publicar no Instagram e no Facebook</h2>
      {corpo}
    </section>
  );
}
