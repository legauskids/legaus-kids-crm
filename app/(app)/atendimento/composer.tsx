"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Zap, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { enviarMensagemAction } from "@/app/(app)/atendimento/actions";
import { QuickRepliesPopover } from "@/app/(app)/atendimento/quick-replies-popover";
import { AgendarDialog } from "@/app/(app)/atendimento/agendar-dialog";
import { SlashCommandMenu, type SlashCommand } from "@/app/(app)/atendimento/slash-command-menu";
import { PromoverNegocioDialog } from "@/app/(app)/atendimento/promover-negocio-dialog";
import { TarefaMiniForm } from "@/app/(app)/atendimento/tarefa-mini-form";
import { MoverMiniForm } from "@/app/(app)/atendimento/mover-mini-form";
import type { RespostaRapidaVM, NegocioLinkVM } from "@/app/(app)/atendimento/types";

type Funil = { id: string; nome: string; etapas: { id: string; nome: string }[] };

export function Composer({
  conversaId,
  contatoId,
  contatoNome,
  atendenteId,
  currentUserId,
  respostasRapidas,
  funis,
  negociosDoContato,
  usuarios,
}: {
  conversaId: string;
  contatoId: string;
  contatoNome: string;
  atendenteId: string | null;
  currentUserId: string;
  respostasRapidas: RespostaRapidaVM[];
  funis: Funil[];
  negociosDoContato: NegocioLinkVM[];
  usuarios: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [pending, startTransition] = useTransition();
  const [agendarAberto, setAgendarAberto] = useState(false);
  const [comandoAberto, setComandoAberto] = useState<SlashCommand | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mostrarSlashMenu = useMemo(() => /^\/[a-zà-ú]*$/i.test(texto), [texto]);

  function enviar() {
    if (!texto.trim()) return;
    const formData = new FormData();
    formData.set("conversaId", conversaId);
    formData.set("texto", texto.trim());
    startTransition(async () => {
      await enviarMensagemAction(formData);
      setTexto("");
      router.refresh();
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !mostrarSlashMenu) {
      e.preventDefault();
      enviar();
    }
  }

  function selecionarComando(cmd: SlashCommand) {
    setTexto("");
    setComandoAberto(cmd);
  }

  const responsavelSugerido = atendenteId ?? currentUserId;

  return (
    <div className="relative border-t p-3">
      {mostrarSlashMenu && (
        <SlashCommandMenu filtro={texto.slice(1)} onSelect={selecionarComando} />
      )}

      <div className="flex items-end gap-2">
        <QuickRepliesPopover
          respostas={respostasRapidas}
          onSelect={(t) => {
            setTexto(t);
            textareaRef.current?.focus();
          }}
        >
          <Button variant="ghost" size="icon" title="Respostas rápidas">
            <Zap className="size-4" />
          </Button>
        </QuickRepliesPopover>

        <Button
          variant="ghost"
          size="icon"
          title="Agendar mensagem"
          disabled={!texto.trim()}
          onClick={() => setAgendarAberto(true)}
        >
          <Clock className="size-4" />
        </Button>

        <Textarea
          ref={textareaRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite uma mensagem, ou / para comandos..."
          className={cn("min-h-10 flex-1 resize-none")}
          rows={1}
        />

        <Button size="icon" disabled={!texto.trim() || pending} onClick={enviar}>
          <Send className="size-4" />
        </Button>
      </div>

      <AgendarDialog
        open={agendarAberto}
        onOpenChange={setAgendarAberto}
        conversaId={conversaId}
        textoInicial={texto}
        onScheduled={() => {
          setTexto("");
          router.refresh();
        }}
      />

      <PromoverNegocioDialog
        open={comandoAberto === "negocio"}
        onOpenChange={(open) => !open && setComandoAberto(null)}
        conversaId={conversaId}
        contatoId={contatoId}
        contatoNome={contatoNome}
        funis={funis}
        usuarios={usuarios}
        responsavelSugeridoId={responsavelSugerido}
      />

      <TarefaMiniForm
        open={comandoAberto === "tarefa"}
        onOpenChange={(open) => !open && setComandoAberto(null)}
        conversaId={conversaId}
        contatoId={contatoId}
        usuarios={usuarios}
      />

      <MoverMiniForm
        open={comandoAberto === "mover"}
        onOpenChange={(open) => !open && setComandoAberto(null)}
        negocios={negociosDoContato}
        funis={funis}
      />
    </div>
  );
}
