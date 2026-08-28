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
import { atualizarContatoAction, type ContatoFormState } from "@/app/(app)/contatos/actions";
import type { ContatoVM } from "@/app/(app)/contatos/contatos-shell";

const initialState: ContatoFormState = {};

export function EditarContatoDialog({
  contato,
  onOpenChange,
}: {
  contato: ContatoVM | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState(atualizarContatoAction, initialState);

  useEffect(() => {
    if (state.success) onOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <Dialog open={contato != null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar contato</DialogTitle>
        </DialogHeader>
        {contato && (
          <form action={formAction} className="space-y-4" key={contato.id}>
            <input type="hidden" name="contatoId" value={contato.id} />

            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" name="nome" defaultValue={contato.nome} required />
            </div>

            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={contato.telefone} disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="empresa">Empresa</Label>
              <Input id="empresa" name="empresa" defaultValue={contato.empresa ?? ""} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Etiquetas (separadas por vírgula)</Label>
              <Input id="tags" name="tags" defaultValue={contato.tags.join(", ")} placeholder="cliente, vip..." />
            </div>

            {state.error && <p className="text-sm text-destructive">{state.error}</p>}

            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
