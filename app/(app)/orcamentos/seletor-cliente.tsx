"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { filtrarClientes, formatarDocumento, type ClienteBuscavel } from "@/lib/utils/busca-cliente";
import { telefoneLegivel } from "@/lib/utils/telefone";

// Cliente do orçamento (pedido de 2026-11-05): no lugar da lista com todos os
// contatos, um campo de busca por nome, empresa/razão social, CPF, CNPJ ou
// telefone (lib/utils/busca-cliente.ts).

function detalhes(c: ClienteBuscavel): string {
  return [c.razaoSocial || c.empresa, formatarDocumento(c.cnpj), c.cpf ? `CPF ${formatarDocumento(c.cpf)}` : null, c.telefone ? telefoneLegivel(c.telefone) : null]
    .filter(Boolean)
    .join(" · ");
}

export function SeletorCliente({
  clientes,
  valor,
  onChange,
  onNovoCliente,
}: {
  clientes: ClienteBuscavel[];
  valor: string;
  onChange: (id: string) => void;
  /** "Cadastrar novo cliente" quando a busca não acha (recebe o que foi digitado). */
  onNovoCliente: (termo: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [ativo, setAtivo] = useState(0);
  const escolhido = clientes.find((c) => c.id === valor) ?? null;
  const resultados = useMemo(() => filtrarClientes(clientes, termo), [clientes, termo]);

  function escolher(id: string) {
    onChange(id);
    setAberto(false);
    setTermo("");
    setAtivo(0);
  }

  function teclas(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivo((i) => Math.min(i + 1, resultados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && resultados[ativo]) {
      e.preventDefault();
      escolher(resultados[ativo].id);
    }
  }

  return (
    <Popover
      open={aberto}
      onOpenChange={(abrir) => {
        setAberto(abrir);
        if (!abrir) setTermo("");
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={aberto} className="h-auto min-h-9 w-full min-w-0 justify-between py-1.5 font-normal">
          {escolhido ? (
            <span className="min-w-0 text-left">
              <span className="block truncate">{escolhido.nome}</span>
              {detalhes(escolhido) && <span className="block truncate text-xs text-muted-foreground">{detalhes(escolhido)}</span>}
            </span>
          ) : (
            <span className="text-muted-foreground">Buscar cliente por nome, CPF ou CNPJ</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 p-0">
        <div className="relative border-b">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={termo}
            onChange={(e) => {
              setTermo(e.target.value);
              setAtivo(0);
            }}
            onKeyDown={teclas}
            placeholder="Nome, CPF, CNPJ ou telefone"
            className="rounded-none border-0 pl-8 shadow-none focus-visible:ring-0"
            autoComplete="off"
            aria-label="Buscar cliente"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1 text-sm">
          {!termo.trim() ? (
            <>
              <p className="px-2 py-2 text-xs text-muted-foreground">Digite o nome, a empresa, o CPF, o CNPJ ou o telefone.</p>
              {escolhido && (
                <button type="button" onClick={() => escolher("")} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-muted-foreground hover:bg-accent">
                  <X className="size-4" />
                  Tirar o cliente do orçamento
                </button>
              )}
            </>
          ) : resultados.length === 0 ? (
            <div className="space-y-2 px-2 py-2">
              <p className="text-muted-foreground">Nenhum cliente encontrado.</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setAberto(false);
                  onNovoCliente(termo.trim());
                  setTermo("");
                }}
              >
                <UserPlus className="size-3.5" />
                Cadastrar novo cliente
              </Button>
            </div>
          ) : (
            <ul role="listbox" aria-label="Clientes encontrados">
              {resultados.map((c, i) => (
                <li key={c.id} role="option" aria-selected={c.id === valor}>
                  <button
                    type="button"
                    onClick={() => escolher(c.id)}
                    onMouseEnter={() => setAtivo(i)}
                    className={cn("flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left", i === ativo && "bg-accent")}
                  >
                    <Check className={cn("mt-0.5 size-4 shrink-0", c.id === valor ? "text-primary" : "invisible")} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.nome}</span>
                      {detalhes(c) && <span className="block truncate text-xs text-muted-foreground">{detalhes(c)}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
