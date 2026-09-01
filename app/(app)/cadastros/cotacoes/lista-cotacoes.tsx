"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, FileSpreadsheet, Loader2 } from "lucide-react";
import { criarCotacaoAction } from "@/app/(app)/cadastros/cotacoes/actions";

export type TipoCotacao = "PLAYGROUND" | "KIDPLAY" | "BRINQUEDOS" | "OUTROS";

export type CotacaoResumoVM = {
  id: string;
  numero: number;
  tipo: TipoCotacao;
  titulo: string;
  criadoEm: string;
  criadoPorNome: string;
  quantidadeItens: number;
};

const TIPOS: { chave: TipoCotacao; label: string }[] = [
  { chave: "PLAYGROUND", label: "Cotações Playground" },
  { chave: "KIDPLAY", label: "Cotações Kidplay" },
  { chave: "BRINQUEDOS", label: "Cotações Brinquedos" },
  { chave: "OUTROS", label: "Outros" },
];

export function ListaCotacoes({ cotacoes }: { cotacoes: CotacaoResumoVM[] }) {
  const router = useRouter();
  const [tipoAtivo, setTipoAtivo] = useState<TipoCotacao>("PLAYGROUND");
  const [pending, startTransition] = useTransition();

  const filtradas = cotacoes.filter((c) => c.tipo === tipoAtivo);

  function novaCotacao() {
    startTransition(async () => {
      const { id } = await criarCotacaoAction(tipoAtivo);
      router.push(`/cadastros/cotacoes/${id}`);
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-card px-6 py-3">
        <div className="flex flex-wrap gap-1">
          {TIPOS.map((t) => (
            <button
              key={t.chave}
              type="button"
              onClick={() => setTipoAtivo(t.chave)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tipoAtivo === t.chave ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Calculadora de custo e margem por categoria — separada do Orçamento (que é o documento formal pro cliente). Use pra
          calcular o preço antes de fechar a proposta.
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-auto p-6">
        <Button onClick={novaCotacao} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Nova cotação
        </Button>

        {filtradas.length === 0 ? (
          <p className="pt-4 text-sm text-muted-foreground">Nenhuma cotação ainda nessa categoria.</p>
        ) : (
          <div className="space-y-2">
            {filtradas.map((c) => (
              <Link
                key={c.id}
                href={`/cadastros/cotacoes/${c.id}`}
                className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      #{String(c.numero).padStart(4, "0")} — {c.titulo}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.quantidadeItens} itens · {c.criadoPorNome} · {new Date(c.criadoEm).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
