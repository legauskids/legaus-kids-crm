import Link from "next/link";
import { centavosParaReais } from "@/lib/utils/money";
import type { NegocioLinkVM } from "@/app/(app)/atendimento/types";

export function SidePanel({ negocios }: { negocios: NegocioLinkVM[] }) {
  return (
    <div className="flex h-full flex-col p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Negócios vinculados</h3>
      {negocios.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum negócio vinculado a este contato ainda.</p>
      ) : (
        <ul className="space-y-2">
          {negocios.map((n) => (
            <li key={n.id}>
              <Link
                href={`/negocios/${n.id}`}
                className="block rounded-md border p-2.5 text-sm transition-colors hover:bg-muted/50"
              >
                <p className="font-medium leading-snug">{n.titulo}</p>
                <p className="text-xs text-muted-foreground">
                  {n.funilNome} · {n.etapaNome}
                </p>
                <p className="mt-1 text-xs font-medium">{centavosParaReais(n.valorCentavos)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
