"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { colunaKanbanTarefa, estaNoPeriodo, type Periodo } from "@/lib/utils/dates";
import { STATUS_LABEL, type TarefaVM } from "@/app/(app)/tarefas/types";
import { KanbanView } from "@/app/(app)/tarefas/kanban-view";
import { ListaView } from "@/app/(app)/tarefas/lista-view";
import { CalendarioView } from "@/app/(app)/tarefas/calendario-view";
import { NovaTarefaDialog } from "@/app/(app)/tarefas/nova-tarefa-dialog";

type Funil = { id: string; nome: string; etapas: { id: string; nome: string }[] };

const VIEWS = [
  { id: "kanban", label: "Kanban" },
  { id: "lista", label: "Lista" },
  { id: "calendario", label: "Calendário" },
] as const;

const STATUS_FILTROS = ["A_FAZER", "EM_ANDAMENTO", "APROVACAO", "ATRASADA", "CONCLUIDA"] as const;
const TODOS = "__todos__";

export function TarefasShell({
  tarefas,
  funis,
  usuarios,
  negocios,
}: {
  tarefas: TarefaVM[];
  funis: Funil[];
  usuarios: { id: string; nome: string }[];
  negocios: { id: string; titulo: string; contatoNome: string }[];
}) {
  const [view, setView] = useState<(typeof VIEWS)[number]["id"]>("kanban");
  const [responsavelId, setResponsavelId] = useState(TODOS);
  const [funilId, setFunilId] = useState(TODOS);
  const [etapaId, setEtapaId] = useState(TODOS);
  const [status, setStatus] = useState<string>(TODOS);
  const [periodo, setPeriodo] = useState<Periodo | typeof TODOS>(TODOS);
  const [novaAberta, setNovaAberta] = useState(false);

  const etapasDoFunil = funis.find((f) => f.id === funilId)?.etapas ?? [];

  const filtradasSemStatus = useMemo(() => {
    return tarefas.filter((t) => {
      if (responsavelId !== TODOS && t.responsavelId !== responsavelId) return false;
      if (funilId !== TODOS && t.funilId !== funilId) return false;
      if (etapaId !== TODOS && t.etapaId !== etapaId) return false;
      if (periodo !== TODOS && !estaNoPeriodo(new Date(t.prazo), periodo)) return false;
      return true;
    });
  }, [tarefas, responsavelId, funilId, etapaId, periodo]);

  const contagens = useMemo(() => {
    const counts: Record<string, number> = { A_FAZER: 0, EM_ANDAMENTO: 0, APROVACAO: 0, ATRASADA: 0, CONCLUIDA: 0 };
    for (const t of filtradasSemStatus) {
      counts[colunaKanbanTarefa(new Date(t.prazo), t.status)]++;
    }
    return counts;
  }, [filtradasSemStatus]);

  const tarefasFiltradas = useMemo(() => {
    if (status === TODOS) return filtradasSemStatus;
    return filtradasSemStatus.filter((t) => colunaKanbanTarefa(new Date(t.prazo), t.status) === status);
  }, [filtradasSemStatus, status]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-3 shadow-xs">
        <div className="flex gap-1.5">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                view === v.id
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setNovaAberta(true)}>
          <Plus className="size-4" />
          Nova tarefa
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-2">
        <Select value={responsavelId} onValueChange={setResponsavelId}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos responsáveis</SelectItem>
            {usuarios.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={funilId}
          onValueChange={(value) => {
            setFunilId(value);
            setEtapaId(TODOS);
          }}
        >
          <SelectTrigger size="sm" className="w-40">
            <SelectValue placeholder="Funil" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos funis</SelectItem>
            {funis.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {funilId !== TODOS && (
          <Select value={etapaId} onValueChange={setEtapaId}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue placeholder="Etapa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas etapas</SelectItem>
              {etapasDoFunil.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo | typeof TODOS)}>
          <SelectTrigger size="sm" className="w-32">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todo período</SelectItem>
            <SelectItem value="hoje">Hoje</SelectItem>
            <SelectItem value="semana">Semana</SelectItem>
            <SelectItem value="mes">Mês</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex flex-wrap gap-1.5">
          <button
            onClick={() => setStatus(TODOS)}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              status === TODOS ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            Todas ({filtradasSemStatus.length})
          </button>
          {STATUS_FILTROS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                status === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {STATUS_LABEL[s]} ({contagens[s]})
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {view === "kanban" && <KanbanView tarefas={tarefasFiltradas} />}
        {view === "lista" && (
          <div className="h-full overflow-auto">
            <ListaView tarefas={tarefasFiltradas} />
          </div>
        )}
        {view === "calendario" && (
          <div className="h-full overflow-auto">
            <CalendarioView tarefas={tarefasFiltradas} usuarios={usuarios} negocios={negocios} />
          </div>
        )}
      </div>

      <NovaTarefaDialog open={novaAberta} onOpenChange={setNovaAberta} usuarios={usuarios} negocios={negocios} />
    </div>
  );
}
