"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { buscarContatosMensagemAction } from "@/app/(app)/tarefas/mensagem-actions";

export type ContatoEscolhido = { id: string; nome: string; telefone: string | null };

/** Escolher pra quem vai a mensagem numa tarefa sem contato (só contatos com telefone). */
export function SeletorContatoMensagem({
  valor,
  onChange,
  idCampo,
}: {
  valor: ContatoEscolhido | null;
  onChange: (contato: ContatoEscolhido | null) => void;
  idCampo: string;
}) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ContatoEscolhido[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (valor || termo.trim().length < 2) return;
    let cancelado = false;
    const t = setTimeout(async () => {
      setBuscando(true);
      const r = await buscarContatosMensagemAction(termo).catch(() => []);
      if (!cancelado) {
        setResultados(r);
        setBuscando(false);
      }
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [termo, valor]);

  if (valor) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <span>
          <span className="font-medium">{valor.nome}</span>
          {valor.telefone && <span className="text-muted-foreground"> · {valor.telefone}</span>}
        </span>
        <button type="button" onClick={() => onChange(null)} className="text-muted-foreground hover:text-foreground" title="Trocar contato">
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input id={idCampo} value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Buscar contato por nome ou telefone" className="pl-8" autoComplete="off" />
        {buscando && <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      {termo.trim().length >= 2 && !buscando && (
        <ul className="max-h-48 overflow-y-auto rounded-md border text-sm">
          {resultados.length === 0 && <li className="px-3 py-2 text-muted-foreground">Nenhum contato com telefone encontrado.</li>}
          {resultados.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(c);
                  setTermo("");
                  setResultados([]);
                }}
                className="w-full px-3 py-2 text-left hover:bg-accent"
              >
                <span className="font-medium">{c.nome}</span>
                <span className="text-muted-foreground"> · {c.telefone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
