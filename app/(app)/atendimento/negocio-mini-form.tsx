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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  criarNegocioMiniFormAction,
  type NegocioMiniFormState,
} from "@/app/(app)/atendimento/actions";

type Funil = { id: string; nome: string; etapas: { id: string; nome: string }[] };

const initialState: NegocioMiniFormState = {};

export function NegocioMiniForm({
  open,
  onOpenChange,
  conversaId,
  contatoId,
  contatoNome,
  funis,
  usuarios,
  responsavelSugeridoId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversaId: string;
  contatoId: string;
  contatoNome: string;
  funis: Funil[];
  usuarios: { id: string; nome: string }[];
  responsavelSugeridoId: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(criarNegocioMiniFormAction, initialState);
  const [funilId, setFunilId] = useState(funis[0]?.id ?? "");
  const funilEscolhido = funis.find((f) => f.id === funilId);

  useEffect(() => {
    if (state.negocioId) {
      onOpenChange(false);
      if (state.abrirTarefa) {
        router.push(`/negocios/${state.negocioId}?abrirTarefa=1`);
      } else {
        router.refresh();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.negocioId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar negócio a partir da conversa</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="conversaId" value={conversaId} />
          <input type="hidden" name="contatoId" value={contatoId} />

          <div className="space-y-2">
            <Label htmlFor="titulo-negocio">Título</Label>
            <Input id="titulo-negocio" name="titulo" defaultValue={`Negócio — ${contatoNome}`} required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="funilId">Funil</Label>
              <Select name="funilId" value={funilId} onValueChange={setFunilId}>
                <SelectTrigger id="funilId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {funis.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="etapaId">Etapa</Label>
              <Select name="etapaId" defaultValue={funilEscolhido?.etapas[0]?.id} key={funilId}>
                <SelectTrigger id="etapaId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {funilEscolhido?.etapas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="valorReais">Valor (R$)</Label>
              <Input id="valorReais" name="valorReais" type="number" min="0" step="0.01" defaultValue="0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="responsavelId">Responsável</Label>
              <Select name="responsavelId" defaultValue={responsavelSugeridoId}>
                <SelectTrigger id="responsavelId" className="w-full">
                  <SelectValue />
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

          <div className="flex items-center gap-2">
            <Checkbox id="criarTarefaFollowUp" name="criarTarefaFollowUp" value="true" />
            <Label htmlFor="criarTarefaFollowUp" className="font-normal">
              Criar tarefa de follow-up após salvar
            </Label>
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
