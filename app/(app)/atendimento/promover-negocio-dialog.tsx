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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
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

export function PromoverNegocioDialog({
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
  const [criarTarefa, setCriarTarefa] = useState(true);
  const funilEscolhido = funis.find((f) => f.id === funilId);

  useEffect(() => {
    if (state.negocioId) {
      onOpenChange(false);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.negocioId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Promover a negócio</DialogTitle>
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
              <Label htmlFor="produto">Produto</Label>
              <Input id="produto" name="produto" placeholder="Ex: Playground modelo X" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="origem">Origem</Label>
              <Input id="origem" name="origem" placeholder="Instagram, indicação..." />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao-negocio">Descrição</Label>
            <Textarea id="descricao-negocio" name="descricao" rows={2} placeholder="O que o cliente pediu, contexto da negociação..." />
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

          <div className="space-y-2">
            <Label htmlFor="previsaoFechamento">Previsão de fechamento</Label>
            <Input id="previsaoFechamento" name="previsaoFechamento" type="date" />
          </div>

          <Separator />

          <div className="flex items-center gap-2">
            <Checkbox
              id="criarTarefa"
              name="criarTarefa"
              value="true"
              checked={criarTarefa}
              onCheckedChange={(v) => setCriarTarefa(v === true)}
            />
            <Label htmlFor="criarTarefa" className="font-normal">
              Já criar uma tarefa de follow-up
            </Label>
          </div>

          {criarTarefa && (
            <div className="space-y-4 rounded-lg border p-3">
              <div className="space-y-2">
                <Label htmlFor="tarefaTitulo">Título da tarefa</Label>
                <Input
                  id="tarefaTitulo"
                  name="tarefaTitulo"
                  defaultValue={`Follow-up — ${contatoNome}`}
                  required={criarTarefa}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tarefaPrazo">Prazo</Label>
                  <Input id="tarefaPrazo" name="tarefaPrazo" type="datetime-local" required={criarTarefa} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tarefaResponsavelId">Responsável pela tarefa</Label>
                  <Select name="tarefaResponsavelId" defaultValue={responsavelSugeridoId}>
                    <SelectTrigger id="tarefaResponsavelId" className="w-full">
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
              <div className="space-y-2">
                <Label htmlFor="tarefaDescricao">Descrição da tarefa</Label>
                <Textarea id="tarefaDescricao" name="tarefaDescricao" rows={2} placeholder="O que precisa ser feito..." />
              </div>
            </div>
          )}

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Criando..." : "Promover a negócio"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
