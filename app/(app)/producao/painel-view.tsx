import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { corPrazoData } from "@/lib/utils/dates";
import type { EmProducaoVM, InstalacaoVM } from "@/app/(app)/producao/types";

const COR_CARD_PRAZO: Record<string, string> = {
  atrasada: "border-destructive/60 bg-destructive/10",
  hoje: "border-amber-400/60 bg-amber-50 dark:bg-amber-950/30",
  normal: "border-sky-400/60 bg-sky-50 dark:bg-sky-950/30",
};

export function PainelView({
  emProducao,
  instalacoes,
}: {
  emProducao: EmProducaoVM[];
  instalacoes: InstalacaoVM[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">🔧 Em produção</h2>
        {emProducao.length === 0 && <p className="text-sm text-muted-foreground">Nenhum projeto em produção.</p>}
        {emProducao.map((n) => {
          const cor = n.previsaoProducao ? corPrazoData(new Date(n.previsaoProducao)) : null;
          return (
            <Link key={n.id} href={`/negocios/${n.id}`}>
              <Card className={cn("transition-colors hover:bg-muted/50", cor && COR_CARD_PRAZO[cor])}>
                <CardContent className="space-y-2 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{n.titulo}</p>
                    <span className="text-xs text-muted-foreground">{n.responsavelNome}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{n.contatoNome}</p>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${n.progressoProducao ?? 0}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{n.progressoProducao ?? 0}% concluído</span>
                    {n.previsaoProducao && (
                      <span>Previsão: {new Date(n.previsaoProducao).toLocaleDateString("pt-BR")}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">🚚 Instalações</h2>
        {instalacoes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma instalação agendada.</p>}
        {instalacoes.map((n) => {
          const cor = corPrazoData(new Date(n.dataInstalacao));
          return (
            <Link key={n.id} href={`/negocios/${n.id}`}>
              <Card className={cn("transition-colors hover:bg-muted/50", COR_CARD_PRAZO[cor])}>
                <CardContent className="space-y-1 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{n.titulo}</p>
                    <span className="text-xs text-muted-foreground">{n.responsavelNome}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{n.contatoNome}</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{new Date(n.dataInstalacao).toLocaleDateString("pt-BR")}</span>
                    <span className="text-muted-foreground">{n.equipeInstalacao ?? "Equipe não definida"}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
