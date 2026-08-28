"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";
import { EditarContatoDialog } from "@/app/(app)/cadastros/editar-contato-dialog";
import { NovoContatoDialog } from "@/app/(app)/cadastros/novo-contato-dialog";
import type { TipoContato } from "@prisma/client";

export type ContatoVM = {
  id: string;
  nome: string;
  empresa: string | null;
  telefone: string | null;
  tags: string[];
  tipo: TipoContato;
  cnpj: string | null;
  razaoSocial: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  negociosCount: number;
  conversasCount: number;
};

const PLACEHOLDER_BUSCA: Record<TipoContato, string> = {
  CONTATO: "Buscar por nome, telefone, empresa ou etiqueta...",
  CLIENTE: "Buscar por nome, razão social ou CNPJ...",
  FORNECEDOR: "Buscar por nome, razão social ou CNPJ...",
};

export function ListaContatos({ tipo, contatos }: { tipo: TipoContato; contatos: ContatoVM[] }) {
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<ContatoVM | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const ehEmpresa = tipo !== "CONTATO";

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return contatos;
    return contatos.filter(
      (c) =>
        c.nome.toLowerCase().includes(termo) ||
        (c.telefone?.includes(termo) ?? false) ||
        (c.empresa?.toLowerCase().includes(termo) ?? false) ||
        (c.razaoSocial?.toLowerCase().includes(termo) ?? false) ||
        (c.cnpj?.includes(termo) ?? false) ||
        c.tags.some((t) => t.toLowerCase().includes(termo)),
    );
  }, [contatos, busca]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b bg-card px-4 py-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={PLACEHOLDER_BUSCA[tipo]} value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-8" />
        </div>
        <Button size="sm" onClick={() => setNovoAberto(true)}>
          <Plus className="size-4" />
          Novo{tipo === "CLIENTE" ? " cliente" : tipo === "FORNECEDOR" ? " fornecedor" : " contato"}
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {filtrados.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Nenhum cadastro encontrado.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Nome</th>
                  <th className="px-4 py-2.5 font-medium">{ehEmpresa ? "Razão social / CNPJ" : "Empresa"}</th>
                  <th className="px-4 py-2.5 font-medium">Telefone</th>
                  <th className="px-4 py-2.5 font-medium">{ehEmpresa ? "Cidade/UF" : "Etiquetas"}</th>
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
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {ehEmpresa ? (
                        <>
                          {c.razaoSocial ?? "—"}
                          {c.cnpj && <span className="block font-mono text-[11px]">{c.cnpj}</span>}
                        </>
                      ) : (
                        (c.empresa ?? "—")
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">{c.telefone ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      {ehEmpresa ? (
                        <span className="text-muted-foreground">{[c.cidade, c.uf].filter(Boolean).join(" / ") || "—"}</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {c.tags.map((t) => (
                            <Badge key={t} variant="secondary" className="text-[10px]">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.negociosCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EditarContatoDialog key={`editar-${editando?.id ?? "fechado"}`} contato={editando} onOpenChange={(open) => !open && setEditando(null)} />
      <NovoContatoDialog key={`novo-${novoAberto ? "aberto" : "fechado"}`} open={novoAberto} onOpenChange={setNovoAberto} tipo={tipo} />
    </div>
  );
}
