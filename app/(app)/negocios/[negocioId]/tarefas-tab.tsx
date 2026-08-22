"use client";

import { useActionState, useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Check, Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  criarTarefaRapidaAction,
  concluirTarefaRapidaAction,
  type CriarTarefaRapidaState,
} from "@/app/(app)/negocios/[negocioId]/actions";

type Tarefa = {
  id: string;
  titulo: string;
  prazo: Date;
  status: string;
  descricao: string | null;
  automatica: boolean;
  responsavel: { nome: string };
};

const STATUS_LABEL: Record<string, string> = {
  A_FAZER: "A fazer",
  EM_ANDAMENTO: "Em andamento",
  APROVACAO: "Aprovação",
  CONCLUIDA: "Concluída",
};

export function TarefasTab({
  negocioId,
  tarefas,
  usuarios,
  abrirFormularioInicialmente = false,
}: {
  negocioId: string;
  tarefas: Tarefa[];
  usuarios: { id: string; nome: string }[];
  abrirFormularioInicialmente?: boolean;
}) {
  const [formOpen, setFormOpen] = useState(abrirFormularioInicialmente);
  const initialState: CriarTarefaRapidaState = {};
  const [state, formAction, pending] = useActionState(
    criarTarefaRapidaAction.bind(null, negocioId),
    initialState,
  );
  const [, startTransition] = useTransition();
  const [successAnterior, setSuccessAnterior] = useState(state.success);

  if (state.success !== successAnterior) {
    setSuccessAnterior(state.success);
    if (state.success) setFormOpen(false);
  }

  return (
    <div className="mt-4 space-y-4">
      <ul className="space-y-2">
        {tarefas.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma tarefa vinculada ainda.</p>
        )}
        {tarefas.map((tarefa) => (
          <li key={tarefa.id}>
            <Card>
              <CardContent className="flex items-start justify-between gap-3 py-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{tarefa.titulo}</p>
                    {tarefa.automatica && <Badge variant="secondary">automática</Badge>}
                    <Badge variant="outline">{STATUS_LABEL[tarefa.status]}</Badge>
                  </div>
                  {tarefa.descricao && <p className="text-xs text-muted-foreground">{tarefa.descricao}</p>}
                  <p className="text-xs text-muted-foreground">
                    {tarefa.responsavel.nome} · prazo {tarefa.prazo.toLocaleString("pt-BR")}
                  </p>
                </div>
                {tarefa.status !== "CONCLUIDA" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => startTransition(() => concluirTarefaRapidaAction(negocioId, tarefa.id))}
                  >
                    <Check className="size-4" />
                    Concluir
                  </Button>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {formOpen ? (
        <Card>
          <CardContent className="pt-6">
            <form action={formAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="titulo">Título</Label>
                <Input id="titulo" name="titulo" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
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
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea id="descricao" name="descricao" />
              </div>
              {state.error && <p className="text-sm text-destructive">{state.error}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending ? "Criando..." : "Criar tarefa"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" onClick={() => setFormOpen(true)}>
          <Plus className="size-4" />
          Nova tarefa
        </Button>
      )}
    </div>
  );
}
