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

export function ExcluirNegocioDialog({
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
          <DialogTitle>Excluir negócio</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            O negócio sai do funil e de todas as listagens, mas o histórico fica guardado — nada se perde de verdade.
          </p>
          <Label htmlFor="motivoExclusao">Motivo da exclusão</Label>
          <Textarea
            id="motivoExclusao"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex: negócio duplicado, cadastro de teste, etc."
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
            {pending ? "Excluindo..." : "Confirmar exclusão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
