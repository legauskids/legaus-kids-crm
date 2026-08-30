"use client";

import { cn } from "@/lib/utils";
import { FileText } from "lucide-react";
import { Composer } from "@/app/(app)/atendimento/composer";
import type {
  ConversaDetalhada,
  RespostaRapidaVM,
  NegocioLinkVM,
} from "@/app/(app)/atendimento/types";

type Funil = { id: string; nome: string; etapas: { id: string; nome: string }[] };

export function MessagesTab({
  conversa,
  currentUserId,
  respostasRapidas,
  funis,
  negociosDoContato,
  usuarios,
}: {
  conversa: ConversaDetalhada;
  currentUserId: string;
  respostasRapidas: RespostaRapidaVM[];
  funis: Funil[];
  negociosDoContato: NegocioLinkVM[];
  usuarios: { id: string; nome: string }[];
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {conversa.mensagens.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
        )}
        {conversa.mensagens.map((m) => (
          <div key={m.id} className={cn("flex", m.direcao === "SAIDA" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[70%] rounded-lg px-3 py-2 text-sm",
                m.direcao === "SAIDA" ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              <p className="whitespace-pre-wrap">{m.texto}</p>
              {m.anexoUrl && (
                <a
                  href={m.anexoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "mt-1.5 flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs underline underline-offset-2",
                    m.direcao === "SAIDA" ? "border-primary-foreground/30 text-primary-foreground" : "border-foreground/15 text-foreground",
                  )}
                >
                  <FileText className="size-3.5 shrink-0" />
                  {m.anexoNome ?? "Arquivo anexado"}
                </a>
              )}
              <p
                className={cn(
                  "mt-1 text-[10px]",
                  m.direcao === "SAIDA" ? "text-primary-foreground/70" : "text-muted-foreground",
                )}
              >
                {m.autorNome ? `${m.autorNome} · ` : ""}
                {new Date(m.enviadaEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}
      </div>

      <Composer
        conversaId={conversa.id}
        contatoId={conversa.contatoId}
        contatoNome={conversa.contatoNome}
        atendenteId={conversa.atendenteId}
        currentUserId={currentUserId}
        respostasRapidas={respostasRapidas}
        funis={funis}
        negociosDoContato={negociosDoContato}
        usuarios={usuarios}
      />
    </div>
  );
}
