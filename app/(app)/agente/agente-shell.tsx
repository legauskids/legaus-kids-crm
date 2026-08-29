"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, Send, Loader2, Bot, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { enviarComandoAgenteAction } from "@/app/(app)/agente/actions";

export type MensagemAgenteVM = {
  id: string;
  textoComando: string;
  resposta: string | null;
  status: string;
  criadoEm: string;
};

const SUGESTOES = [
  "Quais são os orçamentos em aberto?",
  "Cria uma tarefa pra ligar pro cliente Apromes amanhã",
  "Resumo do meu dia",
  "Busca o cliente Apromes",
];

let contadorTemp = 0;
function novaChaveTemp() {
  contadorTemp += 1;
  return `temp-${contadorTemp}`;
}

export function AgenteShell({ historicoInicial }: { historicoInicial: MensagemAgenteVM[] }) {
  const [mensagens, setMensagens] = useState<MensagemAgenteVM[]>(historicoInicial);
  const [texto, setTexto] = useState("");
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  function enviar(comandoForcado?: string) {
    const comando = (comandoForcado ?? texto).trim();
    if (!comando || pending) return;
    setErro(null);
    setTexto("");

    const idTemp = novaChaveTemp();
    setMensagens((atual) => [
      ...atual,
      { id: idTemp, textoComando: comando, resposta: null, status: "PENDENTE", criadoEm: new Date().toISOString() },
    ]);

    startTransition(async () => {
      const resultado = await enviarComandoAgenteAction(comando);
      if ("error" in resultado) {
        setErro(resultado.error);
        setMensagens((atual) => atual.filter((m) => m.id !== idTemp));
        return;
      }
      setMensagens((atual) =>
        atual.map((m) => (m.id === idTemp ? { ...m, resposta: resultado.resposta, status: "CONCLUIDO" } : m)),
      );
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-card px-6 py-3.5 shadow-xs">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
          <Bot className="size-5 text-success" />
          Agente
        </h1>
        <p className="text-sm text-muted-foreground">
          Dê um comando em português — o agente decide o que fazer no CRM. Ações como enviar orçamento pedem confirmação antes.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {mensagens.length === 0 ? (
          <div className="mx-auto max-w-xl space-y-4 pt-10 text-center">
            <p className="text-sm text-muted-foreground">Experimente perguntar algo assim:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => enviar(s)}
                  className="rounded-full border bg-card px-3.5 py-1.5 text-xs text-foreground/80 transition-colors hover:border-primary hover:text-primary"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-5">
            {mensagens.map((m) => (
              <div key={m.id} className="space-y-2">
                <div className="flex items-start justify-end gap-2">
                  <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">{m.textoComando}</div>
                  <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                    <UserIcon className="size-4 text-muted-foreground" />
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-success/15">
                    <Bot className="size-4 text-success" />
                  </div>
                  {m.resposta != null ? (
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm",
                        m.status === "AGUARDANDO_CONFIRMACAO" ? "bg-warning/15 text-foreground" : "bg-muted text-foreground",
                      )}
                    >
                      {m.resposta}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      Pensando...
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={fimRef} />
          </div>
        )}
      </div>

      {erro && <p className="px-6 text-sm text-destructive">{erro}</p>}

      <div className="border-t bg-card p-4">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <span className="mb-2 shrink-0" title="Comando por voz vem pelo WhatsApp">
            <Mic className="size-4 text-muted-foreground" />
          </span>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
            placeholder="Digite um comando..."
            rows={1}
            className="min-h-10 resize-none"
          />
          <Button onClick={() => enviar()} disabled={pending || !texto.trim()} size="icon">
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
