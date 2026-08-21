"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Plus } from "lucide-react";
import {
  criarFunilAction,
  criarEtapaAction,
  atualizarEtapaAction,
  reordenarEtapasAction,
} from "@/app/(app)/negocios/funis/actions";

type Etapa = { id: string; nome: string; ordem: number; slaDias: number | null; tipo: "NORMAL" | "GANHO" | "PERDIDO" };
type Funil = { id: string; nome: string; etapas: Etapa[] };

export function FunisEditor({ funis }: { funis: Funil[] }) {
  const [novoFunilNome, setNovoFunilNome] = useState("");
  const [, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      {funis.map((funil) => (
        <FunilCard key={funil.id} funil={funil} />
      ))}

      <Card>
        <CardContent className="flex items-center gap-2 pt-6">
          <Input
            placeholder="Nome do novo funil"
            value={novoFunilNome}
            onChange={(e) => setNovoFunilNome(e.target.value)}
          />
          <Button
            onClick={() =>
              startTransition(async () => {
                await criarFunilAction(novoFunilNome);
                setNovoFunilNome("");
              })
            }
            disabled={!novoFunilNome.trim()}
          >
            <Plus className="size-4" />
            Novo funil
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function FunilCard({ funil }: { funil: Funil }) {
  const [etapas, setEtapas] = useState(() => [...funil.etapas].sort((a, b) => a.ordem - b.ordem));
  const [novaEtapaNome, setNovaEtapaNome] = useState("");
  const [novaEtapaSla, setNovaEtapaSla] = useState("");
  const [, startTransition] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setEtapas((prev) => {
      const oldIndex = prev.findIndex((e) => e.id === active.id);
      const newIndex = prev.findIndex((e) => e.id === over.id);
      const reordered = arrayMove(prev, oldIndex, newIndex);
      startTransition(async () => {
        await reordenarEtapasAction(reordered.map((e) => e.id));
      });
      return reordered;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{funil.nome}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <DndContext id={`etapas-${funil.id}`} sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={etapas.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {etapas.map((etapa) => (
                <EtapaRow
                  key={etapa.id}
                  etapa={etapa}
                  onChange={(updated) =>
                    setEtapas((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
                  }
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        <div className="flex items-center gap-2 pt-2">
          <Input
            placeholder="Nova etapa"
            value={novaEtapaNome}
            onChange={(e) => setNovaEtapaNome(e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="SLA (dias)"
            type="number"
            min="0"
            value={novaEtapaSla}
            onChange={(e) => setNovaEtapaSla(e.target.value)}
            className="w-32"
          />
          <Button
            variant="outline"
            disabled={!novaEtapaNome.trim()}
            onClick={() =>
              startTransition(async () => {
                await criarEtapaAction(
                  funil.id,
                  novaEtapaNome,
                  novaEtapaSla.trim() ? Number(novaEtapaSla) : null,
                );
                setNovaEtapaNome("");
                setNovaEtapaSla("");
              })
            }
          >
            <Plus className="size-4" />
            Adicionar etapa
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EtapaRow({ etapa, onChange }: { etapa: Etapa; onChange: (etapa: Etapa) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: etapa.id });
  const [, startTransition] = useTransition();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border bg-background p-2"
    >
      <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground active:cursor-grabbing">
        <GripVertical className="size-4" />
      </button>
      <Input
        defaultValue={etapa.nome}
        className="flex-1"
        onBlur={(e) => {
          const nome = e.target.value.trim();
          if (nome && nome !== etapa.nome) {
            onChange({ ...etapa, nome });
            startTransition(() => atualizarEtapaAction(etapa.id, { nome }));
          }
        }}
      />
      <Input
        type="number"
        min="0"
        placeholder="SLA"
        defaultValue={etapa.slaDias ?? ""}
        className="w-24"
        onBlur={(e) => {
          const value = e.target.value.trim();
          const slaDias = value ? Number(value) : null;
          if (slaDias !== etapa.slaDias) {
            onChange({ ...etapa, slaDias });
            startTransition(() => atualizarEtapaAction(etapa.id, { slaDias }));
          }
        }}
      />
      {etapa.tipo !== "NORMAL" && <Badge variant="secondary">{etapa.tipo}</Badge>}
    </li>
  );
}
