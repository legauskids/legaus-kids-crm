"use client";

import { useActionState, useEffect } from "react";
import { format } from "date-fns";
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
import { atualizarTarefaAction, type AtualizarTarefaState } from "@/app/(app)/tarefas/actions";
import type { TarefaVM } from "@/app/(app)/tarefas/types";

const initialState: AtualizarTarefaState = {};
const SEM_NEGOCIO = "__nenhum__";

export function EditarTarefaDialog({
  tarefa,
  onOpenChange,
  usuarios,
  negocios,
}: {
  tarefa: TarefaVM | null;
  onOpenChange: (open: boolean) => void;
  usuarios: { id: string; nome: string }[];
  negocios: { id: string; titulo: string; contatoNome: string }[];
}) {
  const atualizarComId = atualizarTarefaAction.bind(null, tarefa?.id ?? "");
  const [state, formAction, pending] = useActionState(atualizarComId, initialState);

  useEffect(() => {
    if (state.success) onOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  if (!tarefa) return null;

  return (
    <Dialog open={!!tarefa} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar tarefa</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="titulo-editar">Título</Label>
            <Input id="titulo-editar" name="titulo" defaultValue={tarefa.titulo} required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="responsavelId-editar">Responsável</Label>
              <Select name="responsavelId" defaultValue={tarefa.responsavelId} required>
                <SelectTrigger id="responsavelId-editar" className="w-full">
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
              <Label htmlFor="prazo-editar">Prazo</Label>
              <Input
                id="prazo-editar"
                name="prazo"
                type="datetime-local"
                defaultValue={format(new Date(tarefa.prazo), "yyyy-MM-dd'T'HH:mm")}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="negocioId-editar">Negócio vinculado (opcional)</Label>
            <Select name="negocioId" defaultValue={tarefa.negocioId ?? SEM_NEGOCIO}>
              <SelectTrigger id="negocioId-editar" className="w-full">
                <SelectValue placeholder="Nenhum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_NEGOCIO}>Nenhum (tarefa avulsa)</SelectItem>
                {negocios.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.titulo} — {n.contatoNome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status-editar">Status</Label>
            <Select name="status" defaultValue={tarefa.status}>
              <SelectTrigger id="status-editar" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A_FAZER">A fazer</SelectItem>
                <SelectItem value="EM_ANDAMENTO">Em andamento</SelectItem>
                <SelectItem value="APROVACAO">Aprovação</SelectItem>
                <SelectItem value="CONCLUIDA">Concluída</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao-editar">Descrição</Label>
            <Textarea
              id="descricao-editar"
              name="descricao"
              defaultValue={tarefa.descricao ?? ""}
              placeholder="O que precisa ser feito (ou aprovado)?"
            />
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
