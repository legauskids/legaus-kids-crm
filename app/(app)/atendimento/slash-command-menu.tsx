"use client";

import { cn } from "@/lib/utils";

export type SlashCommand = "negocio" | "tarefa" | "mover";

const COMMANDS: { id: SlashCommand; label: string; description: string }[] = [
  { id: "negocio", label: "/negócio", description: "Criar negócio a partir desta conversa" },
  { id: "tarefa", label: "/tarefa", description: "Criar tarefa vinculada a esta conversa" },
  { id: "mover", label: "/mover", description: "Mudar etapa do funil do negócio vinculado" },
];

export function SlashCommandMenu({
  filtro,
  onSelect,
}: {
  filtro: string;
  onSelect: (cmd: SlashCommand) => void;
}) {
  const opcoes = COMMANDS.filter((c) => c.id.startsWith(filtro.toLowerCase()));

  if (opcoes.length === 0) return null;

  return (
    <div className="absolute bottom-full left-3 mb-1 w-72 overflow-hidden rounded-md border bg-popover shadow-md">
      {opcoes.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={cn(
            "flex w-full flex-col items-start px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
          )}
        >
          <span className="font-medium">{c.label}</span>
          <span className="text-xs text-muted-foreground">{c.description}</span>
        </button>
      ))}
    </div>
  );
}
