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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { criarTarefaAction, type CriarTarefaState } from "@/app/(app)/tarefas/actions";
import { ChecklistNovaTarefa } from "@/app/(app)/tarefas/checklist-nova-tarefa";
import { CamposCategoriaTarefa } from "@/components/tarefas/campos-categoria-tarefa";
import { CamposMensagemNovaTarefa } from "@/components/tarefas/campos-mensagem-nova-tarefa";

const initialState: CriarTarefaState = {};
const SEM_NEGOCIO = "__nenhum__";

export function NovaTarefaDialog({
  open,
  onOpenChange,
  usuarios,
  negocios,
  valoresIniciais,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuarios: { id: string; nome: string }[];
  negocios: { id: string; titulo: string; contatoNome: string; contato?: { nome: string; telefone: string | null } | null }[];
  /** Pré-preenchimento (ex.: "Planejar amanhã" do Painel: categoria Gerar Receita + próximo dia útil). */
  valoresIniciais?: { categoriaId?: string; prazo?: string; responsavelId?: string; titulo?: string };
}) {
  const [state, formAction, pending] = useActionState(criarTarefaAction, initialState);
  const [negocioId, setNegocioId] = useState(SEM_NEGOCIO);
  const negocio = negocios.find((n) => n.id === negocioId);
  const destinoMensagem = !negocio ? "escolher" : negocio.contato ? negocio.contato : "sem-contato";

  // Depende do objeto de estado (novo a cada envio), não só de state.success —
  // senão, da 2ª vez em diante (true→true), o diálogo não fechava.
  useEffect(() => {
    if (state.success) onOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{valoresIniciais?.prazo ? "Planejar tarefa" : "Nova tarefa"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="titulo">Título</Label>
            <Input id="titulo" name="titulo" defaultValue={valoresIniciais?.titulo} required />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="responsavelId">Responsável</Label>
              <Select name="responsavelId" defaultValue={valoresIniciais?.responsavelId} required>
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
            <div className="space-y-2">
              <Label htmlFor="prazo">Prazo</Label>
              <Input id="prazo" name="prazo" type="datetime-local" defaultValue={valoresIniciais?.prazo} required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="negocioId">Negócio vinculado (opcional)</Label>
            <Select name="negocioId" value={negocioId} onValueChange={setNegocioId}>
              <SelectTrigger id="negocioId" className="w-full">
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
            <Label htmlFor="status">Status</Label>
            <Select name="status" defaultValue="A_FAZER">
              <SelectTrigger id="status" className="w-full">
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

          <CamposCategoriaTarefa idPrefixo="nova" categoriaIdInicial={valoresIniciais?.categoriaId} />

          <ChecklistNovaTarefa />

          <CamposMensagemNovaTarefa key={negocioId} idPrefixo="nova" destino={destinoMensagem} />

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
