import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";

type Pendencia = {
  id: string;
  titulo: string;
  negocioTitulo: string | null;
  negocioId: string | null;
  contatoNome: string | null;
  prazo: Date;
  responsavelNome: string;
};

function formatarPrazo(prazo: Date): string {
  return prazo.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function PendenciasPosVenda({ pendencias }: { pendencias: Pendencia[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Pendências de contrato, nota fiscal e boleto</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {pendencias.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada pendente — tudo em dia.</p>
        ) : (
          pendencias.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{p.titulo}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {p.negocioTitulo ?? "Negócio avulso"} {p.contatoNome ? `· ${p.contatoNome}` : ""} · prazo {formatarPrazo(p.prazo)} ·{" "}
                  {p.responsavelNome}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {p.titulo === "Emissão de contrato" && p.negocioId && (
                  <a
                    href={`/api/pdf/contrato/${p.negocioId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-primary underline underline-offset-2"
                  >
                    <FileText className="size-3.5" />
                    Contrato
                  </a>
                )}
                {p.negocioId && (
                  <Link href={`/negocios/${p.negocioId}`}>
                    <Badge variant="outline" className="cursor-pointer text-[10px]">
                      Ver negócio
                    </Badge>
                  </Link>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
