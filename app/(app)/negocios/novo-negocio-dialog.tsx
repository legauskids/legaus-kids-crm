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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { criarNegocioAction, type CriarNegocioState } from "@/app/(app)/negocios/actions";

const initialState: CriarNegocioState = {};

export function NovoNegocioDialog({
  open,
  onOpenChange,
  funilId,
  etapaPadraoId,
  contatos,
  usuarios,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funilId: string;
  etapaPadraoId: string;
  contatos: { id: string; nome: string }[];
  usuarios: { id: string; nome: string }[];
}) {
  const [state, formAction, pending] = useActionState(criarNegocioAction, initialState);

  useEffect(() => {
    if (state.success) {
      onOpenChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo negócio</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="funilId" value={funilId} />
          <input type="hidden" name="etapaId" value={etapaPadraoId} />

          <div className="space-y-2">
            <Label htmlFor="titulo">Título</Label>
            <Input id="titulo" name="titulo" required placeholder="Ex: Playground Buffet X" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contatoId">Contato</Label>
            <Select name="contatoId" defaultValue="__nenhum__">
              <SelectTrigger id="contatoId" className="w-full">
                <SelectValue placeholder="Selecione um contato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__nenhum__">Sem contato</SelectItem>
                {contatos.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="valorReais">Valor (R$)</Label>
              <Input id="valorReais" name="valorReais" type="number" min="0" step="0.01" defaultValue="0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="responsavelId">Responsável</Label>
              <Select name="responsavelId" required>
                <SelectTrigger id="responsavelId" className="w-full">
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="previsaoFechamento">Previsão de fechamento</Label>
              <Input id="previsaoFechamento" name="previsaoFechamento" type="date" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="origem">Origem</Label>
              <Input id="origem" name="origem" placeholder="Instagram, indicação..." />
            </div>
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Criando..." : "Criar negócio"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
