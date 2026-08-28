"use client";

import { useActionState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { criarContatoAction, type ContatoFormState } from "@/app/(app)/contatos/actions";

const initialState: ContatoFormState = {};

export function NovoContatoDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState(criarContatoAction, initialState);

  useEffect(() => {
    if (state.success) onOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo contato</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome-novo">Nome</Label>
            <Input id="nome-novo" name="nome" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="telefone-novo">Telefone</Label>
            <Input id="telefone-novo" name="telefone" placeholder="55999999999" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="empresa-novo">Empresa</Label>
            <Input id="empresa-novo" name="empresa" />
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Criando..." : "Criar contato"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
