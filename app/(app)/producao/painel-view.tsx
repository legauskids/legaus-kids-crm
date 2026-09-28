import type { ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { corPrazoData, diasDesde, formatarDataCalendario } from "@/lib/utils/dates";
import { BotaoConcluir } from "@/app/(app)/producao/botao-concluir";
import type { AvaliacaoVM, EmProducaoVM, InstalacaoVM } from "@/app/(app)/producao/types";

const COR_CARD_PRAZO: Record<string, string> = {
  atrasada: "border-destructive/60 bg-destructive/10",
  hoje: "border-amber-400/60 bg-amber-50 dark:bg-amber-950/30",
  normal: "border-sky-400/60 bg-sky-50 dark:bg-sky-950/30",
};

// O cartão inteiro abre o negócio; o botão "Concluído" fica fora do link
// (link dentro de link / botão dentro de link quebra o clique).
function CartaoNegocio({
  href,
  classe,
  children,
  rodape,
}: {
  href: string;
  classe?: string | null;
  children: ReactNode;
  rodape?: ReactNode;
}) {
  return (
    <Card className={cn("overflow-hidden transition-colors", classe)}>
      <Link href={href} className="block hover:bg-muted/40">
        <CardContent className="space-y-2 py-3">{children}</CardContent>
      </Link>
      {rodape && <div className="flex items-center justify-end gap-2 border-t border-border/60 px-4 py-1.5">{rodape}</div>}
    </Card>
  );
}

export function PainelView({
  emProducao,
  instalacoes,
  emAvaliacao,
}: {
  emProducao: EmProducaoVM[];
  instalacoes: InstalacaoVM[];
  emAvaliacao: AvaliacaoVM[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">🔧 Em produção</h2>
        {emProducao.length === 0 && <p className="text-sm text-muted-foreground">Nenhum projeto em produção.</p>}
        {emProducao.map((n) => {
          const cor = n.previsaoProducao ? corPrazoData(new Date(n.previsaoProducao)) : null;
          return (
            <CartaoNegocio
              key={n.id}
              href={`/negocios/${n.id}`}
              classe={cor && COR_CARD_PRAZO[cor]}
              rodape={n.podeConcluir ? <BotaoConcluir negocioId={n.id} titulo={n.titulo} etapaNome={n.etapaNome} /> : null}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{n.titulo}</p>
                <span className="text-xs text-muted-foreground">{n.responsavelNome}</span>
              </div>
              <p className="text-xs text-muted-foreground">{n.contatoNome}</p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${n.progressoProducao ?? 0}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{n.progressoProducao ?? 0}% concluído</span>
                {n.previsaoProducao && <span>Previsão: {formatarDataCalendario(new Date(n.previsaoProducao))}</span>}
              </div>
            </CartaoNegocio>
          );
        })}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">🚚 Instalações</h2>
        {instalacoes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma instalação agendada.</p>}
        {instalacoes.map((n) => {
          const cor = corPrazoData(new Date(n.dataInstalacao));
          return (
            <CartaoNegocio
              key={n.id}
              href={`/negocios/${n.id}`}
              classe={COR_CARD_PRAZO[cor]}
              rodape={n.podeConcluir ? <BotaoConcluir negocioId={n.id} titulo={n.titulo} etapaNome={n.etapaNome} /> : null}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{n.titulo}</p>
                <span className="text-xs text-muted-foreground">{n.responsavelNome}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {n.contatoNome} · {n.etapaNome}
              </p>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{formatarDataCalendario(new Date(n.dataInstalacao))}</span>
                <span className="text-muted-foreground">{n.equipeInstalacao ?? "Equipe não definida"}</span>
              </div>
            </CartaoNegocio>
          );
        })}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">⭐ Avaliação</h2>
        <p className="text-xs text-muted-foreground">Depois da avaliação do cliente, clique em Concluído pra encaminhar à aba Concluídos.</p>
        {emAvaliacao.length === 0 && <p className="text-sm text-muted-foreground">Nenhum projeto aguardando avaliação.</p>}
        {emAvaliacao.map((n) => {
          const dias = diasDesde(new Date(n.desde));
          return (
            <CartaoNegocio
              key={n.id}
              href={`/negocios/${n.id}`}
              rodape={<BotaoConcluir negocioId={n.id} titulo={n.titulo} etapaNome="Avaliação" />}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{n.titulo}</p>
                <span className="text-xs text-muted-foreground">{n.responsavelNome}</span>
              </div>
              <p className="text-xs text-muted-foreground">{n.contatoNome}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{n.dataInstalacao ? `Instalado em ${formatarDataCalendario(new Date(n.dataInstalacao))}` : "Sem data de instalação"}</span>
                <span className={cn(n.slaDias != null && dias > n.slaDias && "font-medium text-destructive")}>
                  {dias === 0 ? "entrou hoje" : `há ${dias} ${dias === 1 ? "dia" : "dias"}`}
                </span>
              </div>
            </CartaoNegocio>
          );
        })}
      </section>
    </div>
  );
}
