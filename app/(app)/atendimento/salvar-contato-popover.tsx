"use client";

import { useState, useTransition } from "react";
import { Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { salvarNomeContatoAction } from "@/app/(app)/atendimento/actions";
import { telefoneLegivel, temNomeSalvo } from "@/lib/utils/telefone";

/** Contato sem nome: botão "Salvar contato". Com nome: lápis ao lado do nome pra corrigir. */
export function SalvarContatoPopover({ contatoId, nome, telefone }: { contatoId: string; nome: string; telefone: string | null }) {
  const temNome = temNomeSalvo(nome);
  const [open, setOpen] = useState(false);
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function abrir(aberto: boolean) {
    setOpen(aberto);
    if (aberto) {
      setValor(temNome ? nome : "");
      setErro(null);
    }
  }

  function salvar() {
    startTransition(async () => {
      const r = await salvarNomeContatoAction(contatoId, valor);
      if (r.ok) setOpen(false);
      else setErro(r.error);
    });
  }

  return (
    <Popover open={open} onOpenChange={abrir}>
      <PopoverTrigger asChild>
        {temNome ? (
          <Button variant="ghost" size="icon-xs" title="Editar nome do contato" className="text-muted-foreground">
            <Pencil />
          </Button>
        ) : (
          <Button variant="outline" size="xs" className="border-primary/40 text-primary">
            <UserPlus />
            Salvar contato
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="nome-contato">Nome do contato</Label>
            <Input id="nome-contato" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex.: Maria Souza" maxLength={120} autoFocus />
            {telefone && <p className="text-xs text-muted-foreground">{telefoneLegivel(telefone)}</p>}
            {erro && <p className="text-xs text-destructive">{erro}</p>}
          </div>
          <Button type="submit" size="sm" className="w-full" disabled={pending || !valor.trim()}>
            {pending ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
