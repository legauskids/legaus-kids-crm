"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";
import { EditarContatoDialog } from "@/app/(app)/contatos/editar-contato-dialog";
import { NovoContatoDialog } from "@/app/(app)/contatos/novo-contato-dialog";

export type ContatoVM = {
  id: string;
  nome: string;
  empresa: string | null;
  telefone: string;
  tags: string[];
  negociosCount: number;
  conversasCount: number;
};

export function ContatosShell({ contatos }: { contatos: ContatoVM[] }) {
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<ContatoVM | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return contatos;
    return contatos.filter(
      (c) =>
        c.nome.toLowerCase().includes(termo) ||
        c.telefone.includes(termo) ||
        (c.empresa?.toLowerCase().includes(termo) ?? false) ||
        c.tags.some((t) => t.toLowerCase().includes(termo)),
    );
  }, [contatos, busca]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b bg-card px-6 py-3.5 shadow-xs">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Contatos</h1>
        <Button size="sm" onClick={() => setNovoAberto(true)}>
          <Plus className="size-4" />
          Novo contato
        </Button>
      </div>

      <div className="border-b bg-card px-6 py-3">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone, empresa ou etiqueta..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {filtrados.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Nenhum contato encontrado.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Nome</th>
                  <th className="px-4 py-2.5 font-medium">Empresa</th>
                  <th className="px-4 py-2.5 font-medium">Telefone</th>
                  <th className="px-4 py-2.5 font-medium">Etiquetas</th>
                  <th className="px-4 py-2.5 font-medium">Negócios</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer border-t transition-colors hover:bg-muted/50"
                    onClick={() => setEditando(c)}
                  >
                    <td className="px-4 py-2.5 font-medium">{c.nome}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.empresa ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">{c.telefone}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {c.tags.map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px]">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.negociosCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EditarContatoDialog contato={editando} onOpenChange={(open) => !open && setEditando(null)} />
      <NovoContatoDialog open={novoAberto} onOpenChange={setNovoAberto} />
    </div>
  );
}
