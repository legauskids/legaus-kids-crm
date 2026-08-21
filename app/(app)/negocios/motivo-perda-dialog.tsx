"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function MotivoPerdaDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar negócio como Perdido</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="motivo">Motivo da perda</Label>
          <Textarea
            id="motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex: cliente optou por outro fornecedor"
          />
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={!motivo.trim() || pending}
            onClick={() =>
              startTransition(async () => {
                await onConfirm(motivo.trim());
                setMotivo("");
              })
            }
          >
            {pending ? "Salvando..." : "Confirmar perda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
