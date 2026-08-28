"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Search } from "lucide-react";
import { centavosParaReais } from "@/lib/utils/money";

const STATUS_VARIANT: Record<string, "secondary" | "success" | "destructive" | "outline"> = {
  RASCUNHO: "secondary",
  ENVIADO: "outline",
  APROVADO: "success",
  RECUSADO: "destructive",
  EXPIRADO: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  ENVIADO: "Enviado",
  APROVADO: "Aprovado",
  RECUSADO: "Recusado",
  EXPIRADO: "Expirado",
};

export type OrcamentoListaVM = {
  id: string;
  numero: number;
  status: string;
  createdAt: string;
  contatoNome: string | null;
  responsavelNome: string;
  totalCentavos: number;
};

export function OrcamentosLista({ orcamentos }: { orcamentos: OrcamentoListaVM[] }) {
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return orcamentos;
    return orcamentos.filter(
      (o) => (o.contatoNome?.toLowerCase().includes(termo) ?? false) || String(o.numero).includes(termo),
    );
  }, [orcamentos, busca]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b bg-card px-6 py-3.5 shadow-xs">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Orçamentos</h1>
        <Button size="sm" asChild>
          <Link href="/orcamentos/novo">
            <Plus className="size-4" />
            Novo orçamento
          </Link>
        </Button>
      </div>

      <div className="border-b bg-card px-6 py-3">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por número ou cliente..." value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-8" />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {filtrados.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Nenhum orçamento ainda.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Nº</th>
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-4 py-2.5 font-medium">Data</th>
                  <th className="px-4 py-2.5 font-medium">Responsável</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((o) => (
                  <tr key={o.id} className="border-t transition-colors hover:bg-muted/50">
                    <td className="px-4 py-2.5">
                      <Link href={`/orcamentos/${o.id}`} className="font-medium hover:underline">
                        #{String(o.numero).padStart(4, "0")}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{o.contatoNome ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {new Intl.DateTimeFormat("pt-BR").format(new Date(o.createdAt))}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{o.responsavelNome}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={STATUS_VARIANT[o.status] ?? "secondary"}>{STATUS_LABEL[o.status] ?? o.status}</Badge>
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-success">{centavosParaReais(o.totalCentavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
