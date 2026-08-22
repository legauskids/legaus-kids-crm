"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  criarTarefaMiniFormAction,
  type TarefaMiniFormState,
} from "@/app/(app)/atendimento/actions";

const initialState: TarefaMiniFormState = {};

export function TarefaMiniForm({
  open,
  onOpenChange,
  conversaId,
  contatoId,
  usuarios,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversaId: string;
  contatoId: string;
  usuarios: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(criarTarefaMiniFormAction, initialState);

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
          <DialogTitle>Criar tarefa vinculada à conversa</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="conversaId" value={conversaId} />
          <input type="hidden" name="contatoId" value={contatoId} />

          <div className="space-y-2">
            <Label htmlFor="titulo-tarefa">Título</Label>
            <Input id="titulo-tarefa" name="titulo" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="responsavelId-tarefa">Responsável</Label>
              <Select name="responsavelId" required>
                <SelectTrigger id="responsavelId-tarefa" className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {usuarios.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prazo-tarefa">Prazo</Label>
              <Input id="prazo-tarefa" name="prazo" type="datetime-local" required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao-tarefa">Descrição</Label>
            <Textarea id="descricao-tarefa" name="descricao" />
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Criando..." : "Criar tarefa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
