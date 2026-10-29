import Link from "next/link";
import { Music2, Plus } from "lucide-react";
import { requireModulo } from "@/lib/auth/guards";
import { listarPostagens } from "@/lib/server/marketing";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ROTULO_CONTEUDO } from "@/lib/utils/postagem-arte";
import { ROTULO_STATUS_POSTAGEM, VARIANTE_STATUS_POSTAGEM } from "@/app/(app)/marketing/rotulos";

export default async function MarketingPage() {
  await requireModulo("marketing");
  const postagens = await listarPostagens();

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3.5 shadow-xs sm:px-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Marketing</h1>
          <p className="text-sm text-muted-foreground">
            Fotos reais das obras viram artes no padrão da Legaus Kids, com legenda sugerida. Nada vai pro ar sem sua aprovação.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/marketing/musicas" className={buttonVariants({ variant: "outline" })}>
            <Music2 className="size-4" />
            Músicas dos stories
          </Link>
          <Link href="/marketing/novo" className={buttonVariants()}>
            <Plus className="size-4" />
            Novo post
          </Link>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {postagens.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            Nenhum post ainda. Toque em <span className="font-medium text-foreground">Novo post</span> e mande as fotos da obra.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {postagens.map((p) => {
              const capa = p.artes[0];
              return (
                <Link key={p.id} href={`/marketing/${p.id}`} className="group overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md">
                  <div className="aspect-[4/5] bg-muted">
                    {capa && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/imagem/postagem-arte/${capa.id}?v=${capa.atualizadoEm.getTime()}`}
                        alt={p.headline ?? `Post ${p.numero}`}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    )}
                  </div>
                  <div className="space-y-1 p-2.5">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs text-muted-foreground">#{p.numero}</span>
                      <Badge variant={VARIANTE_STATUS_POSTAGEM[p.status]}>{ROTULO_STATUS_POSTAGEM[p.status]}</Badge>
                    </div>
                    <p className="truncate text-sm font-medium">{p.headline || ROTULO_CONTEUDO[p.conteudo]}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {ROTULO_CONTEUDO[p.conteudo]}
                      {p.cidade ? ` · ${p.cidade}` : ""} · {p.criadoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </p>
                    {(p.agendadaPara || p.publicadaEm) && (
                      <p className="truncate text-xs font-medium text-primary">
                        {p.status === "AGENDADO" && p.agendadaPara
                          ? `Sai ${p.agendadaPara.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                          : p.publicadaEm
                            ? `Publicado ${p.publicadaEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
                            : null}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
