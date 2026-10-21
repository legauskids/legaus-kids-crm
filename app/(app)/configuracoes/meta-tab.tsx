"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Loader2, PlugZap, RefreshCw, Unplug, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { conectarMetaAction, desconectarMetaAction, testarConexaoMetaAction } from "@/app/(app)/configuracoes/meta-actions";
import { PERMISSAO_FACEBOOK, PERMISSOES_INSTAGRAM, type PaginaMeta } from "@/lib/utils/meta-publicacao";

export type ConexaoMetaVM = {
  paginaNome: string;
  instagramUsuario: string | null;
  permissoes: string[];
  conectadoEm: string;
  verificadoEm: string | null;
  erro: string | null;
} | null;

const PERMISSOES_PRA_MARCAR = [...PERMISSOES_INSTAGRAM, "business_management", PERMISSAO_FACEBOOK];

function quando(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}

/** Conectar o CRM ao Instagram e à Página do Facebook da Legaus (etapa 3 dos posts, 2026-10-21). */
export function MetaTab({ conexao, appConfigurado }: { conexao: ConexaoMetaVM; appConfigurado: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mostrarFormulario, setMostrarFormulario] = useState(!conexao);
  const [token, setToken] = useState("");
  const [paginas, setPaginas] = useState<PaginaMeta[] | null>(null);

  function conectar(paginaId?: string) {
    startTransition(async () => {
      const r = await conectarMetaAction(token, paginaId);
      if (r.ok) {
        toast.success(`Conectado: ${r.conexao.paginaNome}${r.conexao.instagramUsuario ? ` e @${r.conexao.instagramUsuario}` : ""}.`);
        setToken("");
        setPaginas(null);
        setMostrarFormulario(false);
        router.refresh();
      } else if ("escolher" in r) {
        setPaginas(r.escolher);
      } else {
        toast.error(r.error);
      }
    });
  }

  if (!appConfigurado) {
    return <p className="text-sm text-destructive">O app da Meta não está configurado no servidor (META_APP_ID / META_APP_SECRET).</p>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      {conexao && (
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold">
              {conexao.erro ? <XCircle className="size-5 text-destructive" /> : <CheckCircle2 className="size-5 text-success" />}
              {conexao.erro ? "Conexão com problema" : "Conectado"}
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await testarConexaoMetaAction();
                    if (r.ok) toast.success("A conexão está funcionando.");
                    else toast.error(r.error);
                    router.refresh();
                  })
                }
              >
                <RefreshCw className="size-4" />
                Testar
              </Button>
              <Button variant="outline" size="sm" disabled={pending} onClick={() => setMostrarFormulario(true)}>
                <PlugZap className="size-4" />
                Reconectar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={pending}
                onClick={() =>
                  confirm("Desconectar o CRM do Instagram e do Facebook? Os agendamentos não vão sair até conectar de novo.") &&
                  startTransition(async () => {
                    const r = await desconectarMetaAction();
                    if (r.ok) toast.success("Desconectado.");
                    else toast.error(r.error);
                    setMostrarFormulario(true);
                    router.refresh();
                  })
                }
              >
                <Unplug className="size-4" />
                Desconectar
              </Button>
            </div>
          </div>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <dt className="text-muted-foreground">Página do Facebook</dt>
            <dd className="font-medium">{conexao.paginaNome}</dd>
            <dt className="text-muted-foreground">Instagram</dt>
            <dd className="font-medium">{conexao.instagramUsuario ? `@${conexao.instagramUsuario}` : "não ligado à Página"}</dd>
            <dt className="text-muted-foreground">Conectado em</dt>
            <dd>{quando(conexao.conectadoEm)}</dd>
            <dt className="text-muted-foreground">Último teste</dt>
            <dd>{quando(conexao.verificadoEm)}</dd>
          </dl>
          {conexao.erro && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{conexao.erro}</p>}
          <ul className="space-y-1 text-sm">
            <li className="flex items-center gap-2">
              {PERMISSOES_INSTAGRAM.every((p) => conexao.permissoes.includes(p)) ? <CheckCircle2 className="size-4 text-success" /> : <XCircle className="size-4 text-destructive" />}
              Publicar no Instagram (feed, carrossel e story)
            </li>
            <li className="flex items-center gap-2">
              {conexao.permissoes.includes(PERMISSAO_FACEBOOK) ? <CheckCircle2 className="size-4 text-success" /> : <XCircle className="size-4 text-destructive" />}
              Publicar na Página do Facebook
              {!conexao.permissoes.includes(PERMISSAO_FACEBOOK) && <span className="text-xs text-muted-foreground">— falta a permissão pages_manage_posts (passo 4.9)</span>}
            </li>
          </ul>
        </section>
      )}

      {mostrarFormulario && (
        <section className="space-y-4 rounded-xl border bg-card p-4">
          <h2 className="font-semibold">{conexao ? "Reconectar" : "Conectar o Instagram e o Facebook da Legaus"}</h2>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            <li>
              Abra o{" "}
              <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                Explorador da Graph API <ExternalLink className="size-3.5" />
              </a>{" "}
              (com o seu Facebook, o mesmo que administra a Página).
            </li>
            <li>
              Em <b>App da Meta</b>, escolha <b>Legaus Kids CRM</b>.
            </li>
            <li>
              Em <b>Usuário ou Página</b>, escolha <b>Obter token de acesso do usuário</b>.
            </li>
            <li>
              Em <b>Permissões</b>, adicione: {PERMISSOES_PRA_MARCAR.map((p, i) => (
                <span key={p}>
                  <code className="rounded bg-muted px-1 text-xs">{p}</code>
                  {i < PERMISSOES_PRA_MARCAR.length - 1 ? ", " : "."}
                </span>
              ))}
            </li>
            <li>
              Clique em <b>Generate Access Token</b> (Gerar token), confirme com o seu Facebook e, quando perguntar, marque a <b>Página da Legaus</b> e o <b>Instagram da Legaus</b>.
            </li>
            <li>Copie o token (um texto longo que começa com &quot;EAA&quot;) e cole aqui embaixo.</li>
          </ol>
          <div className="space-y-1.5">
            <Label htmlFor="token-meta">Token de acesso</Label>
            <Textarea id="token-meta" value={token} onChange={(e) => setToken(e.target.value)} rows={3} placeholder="EAA..." className="font-mono text-xs" disabled={pending} />
            <p className="text-xs text-muted-foreground">
              O CRM troca esse token por um acesso da Página que não vence e guarda criptografado. O token colado não fica salvo.
            </p>
          </div>
          {paginas && (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">Esse acesso enxerga mais de uma Página. Qual é a da Legaus?</p>
              {paginas.map((p) => (
                <Button key={p.id} variant="outline" className="w-full justify-start" disabled={pending} onClick={() => conectar(p.id)}>
                  {p.nome}
                  {p.instagramUsuario ? ` · @${p.instagramUsuario}` : " · sem Instagram"}
                </Button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Button disabled={pending || token.trim().length < 20} onClick={() => conectar()}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
              Conectar
            </Button>
            {conexao && (
              <Button variant="ghost" onClick={() => setMostrarFormulario(false)} disabled={pending}>
                Cancelar
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
