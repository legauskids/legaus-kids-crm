"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Sparkles } from "lucide-react";
import { atualizarReuniaoAction, gerarAvaliacaoAction } from "@/app/(app)/reunioes/actions";

/**
 * Anotações livres (ata) e a avaliação do que foi tratado — gerada pelo CRM
 * ao encerrar, editável, e usada na pauta sugerida da próxima reunião.
 */
export function AtaReuniao({
  reuniaoId,
  encerrada,
  anotacoes,
  avaliacao,
  avaliacaoAnterior,
}: {
  reuniaoId: string;
  encerrada: boolean;
  anotacoes: string | null;
  avaliacao: string | null;
  /** Avaliação da última reunião encerrada — referência enquanto esta está aberta. */
  avaliacaoAnterior: { titulo: string; texto: string } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [texto, setTexto] = useState(anotacoes ?? "");
  const [editandoAvaliacao, setEditandoAvaliacao] = useState(false);
  const [textoAvaliacao, setTextoAvaliacao] = useState(avaliacao ?? "");
  const [gerando, setGerando] = useState(false);

  function salvarAnotacoes() {
    startTransition(async () => {
      const r = await atualizarReuniaoAction(reuniaoId, { anotacoes: texto });
      if (r.error) return void toast.error(r.error);
      toast.success("Anotações salvas.");
      router.refresh();
    });
  }

  function salvarAvaliacao() {
    startTransition(async () => {
      const r = await atualizarReuniaoAction(reuniaoId, { avaliacao: textoAvaliacao });
      if (r.error) return void toast.error(r.error);
      setEditandoAvaliacao(false);
      router.refresh();
    });
  }

  function gerarAvaliacao() {
    if (avaliacao && !confirm("Refazer a avaliação? O texto atual (inclusive edições) será substituído.")) return;
    setGerando(true);
    startTransition(async () => {
      const r = await gerarAvaliacaoAction(reuniaoId);
      setGerando(false);
      if (r.error) return void toast.error(r.error);
      router.refresh();
    });
  }

  return (
    <section id="ata" className="grid scroll-mt-32 gap-5 lg:grid-cols-2">
      <div className="space-y-2 rounded-xl border bg-card p-4 shadow-xs">
        <h2 className="text-base font-semibold">Anotações da reunião</h2>
        <p className="text-xs text-muted-foreground">Ata livre: o que foi falado, números citados, combinados. Entra na avaliação do CRM.</p>
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={8} placeholder="Anote aqui durante a reunião..." className="text-sm" />
        {texto !== (anotacoes ?? "") && (
          <Button size="sm" onClick={salvarAnotacoes} disabled={pending}>
            Salvar anotações
          </Button>
        )}
      </div>

      <div className="space-y-2 rounded-xl border bg-card p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">Avaliação do CRM</h2>
          {encerrada && (
            <div className="ml-auto flex gap-1.5 print:hidden">
              {avaliacao && !editandoAvaliacao && (
                <Button size="sm" variant="ghost" onClick={() => setEditandoAvaliacao(true)}>
                  <Pencil className="size-3.5" />
                  Editar
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={gerarAvaliacao} disabled={pending}>
                <Sparkles className="size-3.5" />
                {gerando ? "Avaliando..." : avaliacao ? "Refazer" : "Gerar avaliação"}
              </Button>
            </div>
          )}
        </div>

        {!encerrada && (
          <>
            <p className="text-xs text-muted-foreground">
              Ao encerrar, o CRM avalia o que foi decidido, os compromissos, o que ficou em aberto e o que acompanhar — e isso alimenta a pauta da
              próxima reunião.
            </p>
            {avaliacaoAnterior && (
              <details className="rounded-lg border bg-muted/30 px-3 py-2 text-sm" open>
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Avaliação da reunião anterior — {avaliacaoAnterior.titulo}</summary>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{avaliacaoAnterior.texto}</p>
              </details>
            )}
          </>
        )}

        {encerrada &&
          (editandoAvaliacao ? (
            <div className="space-y-2">
              <Textarea value={textoAvaliacao} onChange={(e) => setTextoAvaliacao(e.target.value)} rows={14} className="text-sm" />
              <div className="flex gap-2">
                <Button size="sm" onClick={salvarAvaliacao} disabled={pending}>
                  Salvar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setTextoAvaliacao(avaliacao ?? "");
                    setEditandoAvaliacao(false);
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : avaliacao ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{avaliacao}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Sem avaliação ainda — clique em Gerar avaliação.</p>
          ))}
      </div>
    </section>
  );
}
