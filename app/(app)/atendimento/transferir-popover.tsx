"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRightLeft } from "lucide-react";
import { transferirConversaAction } from "@/app/(app)/atendimento/actions";
import type { ConversaDetalhada } from "@/app/(app)/atendimento/types";

const FILA = "__fila__";

export function TransferirPopover({
  conversa,
  setores,
  usuarios,
}: {
  conversa: ConversaDetalhada;
  setores: { id: string; nome: string }[];
  usuarios: { id: string; nome: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [setorId, setSetorId] = useState(conversa.setorId);
  const [atendenteId, setAtendenteId] = useState(conversa.atendenteId ?? FILA);
  const [pending, startTransition] = useTransition();

  function submit() {
    const formData = new FormData();
    formData.set("conversaId", conversa.id);
    formData.set("setorId", setorId);
    formData.set("atendenteId", atendenteId);
    startTransition(async () => {
      await transferirConversaAction(formData);
      setOpen(false);
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <ArrowRightLeft className="size-3.5" />
          Transferir
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <div className="space-y-1.5">
          <Label>Setor</Label>
          <Select value={setorId} onValueChange={setSetorId}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {setores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Atendente</Label>
          <Select value={atendenteId} onValueChange={setAtendenteId}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILA}>Devolver à fila</SelectItem>
              {usuarios.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" className="w-full" disabled={pending} onClick={submit}>
          {pending ? "Salvando..." : "Confirmar"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
