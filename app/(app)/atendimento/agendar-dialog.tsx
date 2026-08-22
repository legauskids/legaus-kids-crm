"use client";

import { useActionState, useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { criarAgendadaAction, type CriarAgendadaState } from "@/app/(app)/atendimento/actions";

const initialState: CriarAgendadaState = {};

export function AgendarDialog({
  open,
  onOpenChange,
  conversaId,
  textoInicial,
  onScheduled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversaId: string;
  textoInicial: string;
  onScheduled: () => void;
}) {
  const [state, formAction, pending] = useActionState(criarAgendadaAction, initialState);
  const [texto, setTexto] = useState(textoInicial);
  const [openAnterior, setOpenAnterior] = useState(open);

  if (open !== openAnterior) {
    setOpenAnterior(open);
    if (open) setTexto(textoInicial);
  }

  useEffect(() => {
    if (state.success) {
      onOpenChange(false);
      onScheduled();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agendar mensagem</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="conversaId" value={conversaId} />
          <div className="space-y-2">
            <Label htmlFor="texto-agendada">Mensagem</Label>
            <Textarea
              id="texto-agendada"
              name="texto"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              required
              className="min-h-20"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agendadaPara">Data e hora</Label>
            <Input id="agendadaPara" name="agendadaPara" type="datetime-local" required />
          </div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Agendando..." : "Agendar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
