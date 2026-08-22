"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { moverMiniFormAction, type MoverMiniFormState } from "@/app/(app)/atendimento/actions";
import type { NegocioLinkVM } from "@/app/(app)/atendimento/types";

type Funil = { id: string; nome: string; etapas: { id: string; nome: string }[] };

const initialState: MoverMiniFormState = {};

export function MoverMiniForm({
  open,
  onOpenChange,
  negocios,
  funis,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  negocios: NegocioLinkVM[];
  funis: Funil[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(moverMiniFormAction, initialState);
  const [negocioId, setNegocioId] = useState(negocios[0]?.id ?? "");

  const negocioEscolhido = negocios.find((n) => n.id === negocioId);
  const etapas = funis.find((f) => f.id === negocioEscolhido?.funilId)?.etapas ?? [];

  useEffect(() => {
    if (state.success) {
      onOpenChange(false);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mover negócio para outra etapa</DialogTitle>
        </DialogHeader>

        {negocios.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Este contato ainda não tem nenhum negócio. Use /negócio para criar um primeiro.
          </p>
        ) : (
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="negocioId-mover">Negócio</Label>
              <Select name="negocioId" value={negocioId} onValueChange={setNegocioId}>
                <SelectTrigger id="negocioId-mover" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {negocios.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.titulo} ({n.funilNome})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="etapaId-mover">Nova etapa</Label>
              <Select name="etapaId" key={negocioId}>
                <SelectTrigger id="etapaId-mover" className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {etapas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {state.error && <p className="text-sm text-destructive">{state.error}</p>}

            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Movendo..." : "Mover"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
