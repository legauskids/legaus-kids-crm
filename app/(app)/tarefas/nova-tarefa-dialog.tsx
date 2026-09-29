"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
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
import { criarTarefaAction, type CriarTarefaState } from "@/app/(app)/tarefas/actions";

const initialState: CriarTarefaState = {};
const SEM_NEGOCIO = "__nenhum__";

export function NovaTarefaDialog({
  open,
  onOpenChange,
  usuarios,
  negocios,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuarios: { id: string; nome: string }[];
  negocios: { id: string; titulo: string; contatoNome: string }[];
}) {
  const [state, formAction, pending] = useActionState(criarTarefaAction, initialState);

  useEffect(() => {
    if (state.success) onOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova tarefa</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="titulo">Título</Label>
            <Input id="titulo" name="titulo" required />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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
            <div className="space-y-2">
              <Label htmlFor="prazo">Prazo</Label>
              <Input id="prazo" name="prazo" type="datetime-local" required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="negocioId">Negócio vinculado (opcional)</Label>
            <Select name="negocioId" defaultValue={SEM_NEGOCIO}>
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

          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea id="descricao" name="descricao" placeholder="O que precisa ser feito (ou aprovado)?" />
          </div>

          <ChecklistNovaTarefa />

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

/**
 * Checklist montado antes da tarefa existir: cada item vira um campo
 * "checklist" do formulário e é criado junto com a tarefa. O que estiver
 * digitado no campo e não foi adicionado também vai (o campo tem o mesmo
 * nome), pra ninguém perder o último item por esquecer de clicar no +.
 */
function ChecklistNovaTarefa() {
  const [itens, setItens] = useState<string[]>([]);
  const [novo, setNovo] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function adicionar() {
    const texto = novo.trim();
    if (!texto) return;
    setItens((atual) => [...atual, texto]);
    setNovo("");
    inputRef.current?.focus();
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="checklist-novo">Checklist (opcional)</Label>
      {itens.length > 0 && (
        <ul className="space-y-1.5">
          {itens.map((item, indice) => (
            <li key={`${indice}-${item}`} className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1">
              <input type="hidden" name="checklist" value={item} />
              <span className="size-3.5 shrink-0 rounded-sm border border-input" />
              <span className="flex-1 text-sm">{item}</span>
              <button
                type="button"
                title="Remover item"
                onClick={() => setItens((atual) => atual.filter((_, i) => i !== indice))}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          id="checklist-novo"
          ref={inputRef}
          name="checklist"
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              adicionar();
            }
          }}
          placeholder="Adicionar item (Enter)"
        />
        <Button type="button" variant="outline" size="icon" disabled={!novo.trim()} onClick={adicionar} aria-label="Adicionar item">
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}
