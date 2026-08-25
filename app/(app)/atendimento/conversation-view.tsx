"use client";

import { useState, useTransition } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PanelRightClose } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { assumirConversaAction } from "@/app/(app)/atendimento/actions";
import { TransferirPopover } from "@/app/(app)/atendimento/transferir-popover";
import { MessagesTab } from "@/app/(app)/atendimento/messages-tab";
import { NotesTab } from "@/app/(app)/atendimento/notes-tab";
import { ScheduledTab } from "@/app/(app)/atendimento/scheduled-tab";
import type {
  ConversaDetalhada,
  RespostaRapidaVM,
  NegocioLinkVM,
} from "@/app/(app)/atendimento/types";

type Funil = { id: string; nome: string; etapas: { id: string; nome: string }[] };

const TABS = [
  { id: "mensagens", label: "Mensagens" },
  { id: "notas", label: "Notas internas" },
  { id: "agendadas", label: "Agendadas" },
] as const;

export function ConversationView({
  conversa,
  currentUserId,
  setores,
  usuarios,
  respostasRapidas,
  funis,
  negociosDoContato,
  painelAberto,
  onTogglePainel,
}: {
  conversa: ConversaDetalhada;
  currentUserId: string;
  setores: { id: string; nome: string }[];
  usuarios: { id: string; nome: string }[];
  respostasRapidas: RespostaRapidaVM[];
  funis: Funil[];
  negociosDoContato: NegocioLinkVM[];
  painelAberto: boolean;
  onTogglePainel: () => void;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("mensagens");
  const [pending, startTransition] = useTransition();

  const agendadasPendentes = conversa.agendadas.filter((a) => a.status === "PENDENTE").length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-card px-4 py-3 shadow-xs">
        <div className="flex items-center gap-2.5">
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary/10 font-semibold text-primary">{initials(conversa.contatoNome)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium">{conversa.contatoNome}</p>
            {conversa.status === "FILA" && (
              <Badge variant="secondary" className="text-[10px]">
                Fila
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {conversa.status === "FILA" && (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => startTransition(() => assumirConversaAction(conversa.id))}
            >
              Assumir conversa
            </Button>
          )}
          <TransferirPopover conversa={conversa} setores={setores} usuarios={usuarios} />
          {!painelAberto && (
            <Button variant="ghost" size="icon-sm" onClick={onTogglePainel} title="Ocultar/mostrar painel">
              <PanelRightClose className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b bg-card px-4 py-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all",
              tab === t.id
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {t.label}
            {t.id === "agendadas" && agendadasPendentes > 0 && ` (${agendadasPendentes})`}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {tab === "mensagens" && (
          <MessagesTab
            conversa={conversa}
            currentUserId={currentUserId}
            respostasRapidas={respostasRapidas}
            funis={funis}
            negociosDoContato={negociosDoContato}
            usuarios={usuarios}
          />
        )}
        {tab === "notas" && <NotesTab conversaId={conversa.id} notas={conversa.notas} />}
        {tab === "agendadas" && <ScheduledTab conversaId={conversa.id} agendadas={conversa.agendadas} />}
      </div>
    </div>
  );
}
