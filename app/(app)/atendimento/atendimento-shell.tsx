"use client";

import { useState } from "react";
import { PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConversationList } from "@/app/(app)/atendimento/conversation-list";
import { ConversationView } from "@/app/(app)/atendimento/conversation-view";
import { SidePanel } from "@/app/(app)/atendimento/side-panel";
import type {
  ConversaListItem,
  ConversaDetalhada,
  RespostaRapidaVM,
  NegocioLinkVM,
} from "@/app/(app)/atendimento/types";
import type { EscopoConversa } from "@/lib/server/conversas";

type Funil = { id: string; nome: string; etapas: { id: string; nome: string }[] };

export function AtendimentoShell({
  currentUserId,
  conversas,
  conversaSelecionada,
  escopo,
  setorFiltroId,
  setores,
  usuarios,
  respostasRapidas,
  funis,
  negociosDoContato,
}: {
  currentUserId: string;
  conversas: ConversaListItem[];
  conversaSelecionada: ConversaDetalhada | null;
  escopo: EscopoConversa;
  setorFiltroId: string | null;
  setores: { id: string; nome: string }[];
  usuarios: { id: string; nome: string }[];
  respostasRapidas: RespostaRapidaVM[];
  funis: Funil[];
  negociosDoContato: NegocioLinkVM[];
}) {
  const [painelAberto, setPainelAberto] = useState(true);

  return (
    <div className="flex h-full">
      <div className="w-80 shrink-0 border-r">
        <ConversationList
          conversas={conversas}
          escopo={escopo}
          setorFiltroId={setorFiltroId}
          setores={setores}
          conversaSelecionadaId={conversaSelecionada?.id ?? null}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {conversaSelecionada ? (
          <ConversationView
            conversa={conversaSelecionada}
            currentUserId={currentUserId}
            setores={setores}
            usuarios={usuarios}
            respostasRapidas={respostasRapidas}
            funis={funis}
            negociosDoContato={negociosDoContato}
            painelAberto={painelAberto}
            onTogglePainel={() => setPainelAberto((v) => !v)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center text-muted-foreground">
              <p>Selecione uma conversa à esquerda.</p>
            </div>
          </div>
        )}
      </div>

      {conversaSelecionada && painelAberto && (
        <div className="w-72 shrink-0 border-l">
          <SidePanel negocios={negociosDoContato} />
        </div>
      )}

      {conversaSelecionada && !painelAberto && (
        <div className="flex w-10 shrink-0 items-start justify-center border-l pt-2">
          <Button variant="ghost" size="icon-sm" onClick={() => setPainelAberto(true)} title="Mostrar painel">
            <PanelRightOpen className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
