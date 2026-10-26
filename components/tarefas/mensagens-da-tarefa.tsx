"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck, Clock, Loader2, MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { agendarMensagemTarefaAction, cancelarMensagemTarefaAction } from "@/app/(app)/tarefas/mensagem-actions";
import { SeletorContatoMensagem, type ContatoEscolhido } from "@/components/tarefas/seletor-contato-mensagem";
import { valorDataHoraBrasilia } from "@/lib/utils/data-hora";

export type AgendadaVM = { id: string; texto: string; agendadaPara: string; status: "PENDENTE" | "ENVIADA" | "CANCELADA" };
export type MensagensDaTarefaVM = { destino: { nome: string; telefone: string | null } | null; agendadas: AgendadaVM[] };

export function quandoMensagem(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Agendar mensagem de WhatsApp pro contato da tarefa (Tarefas e aba Tarefas do negócio). */
export function MensagensDaTarefa({ tarefaId, prazo, dados }: { tarefaId: string; prazo: string; dados: MensagensDaTarefaVM }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [quando, setQuando] = useState("");
  const [contato, setContato] = useState<ContatoEscolhido | null>(null);
  const destino = dados.destino;
  const semTelefone = destino && !destino.telefone;

  function abrir() {
    // Já começa no prazo da tarefa, se ele ainda não passou.
    setQuando(new Date(prazo).getTime() > Date.now() + 60_000 ? valorDataHoraBrasilia(new Date(prazo)) : "");
    setAberto(true);
  }

  function agendar() {
    startTransition(async () => {
      const r = await agendarMensagemTarefaAction(tarefaId, { texto, quando, contatoId: contato?.id ?? null });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Mensagem agendada pra ${r.contatoNome} em ${quandoMensagem(r.agendadaPara)}.`);
      setAberto(false);
      setTexto("");
      setContato(null);
      router.refresh();
    });
  }

  function cancelar(id: string) {
    if (!confirm("Cancelar essa mensagem agendada?")) return;
    startTransition(async () => {
      const r = await cancelarMensagemTarefaAction(id);
      if (!r.ok) toast.error(r.error);
      else toast.success("Mensagem cancelada.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <MessageCircle className="size-4 shrink-0 text-primary" />
            Mensagem no WhatsApp
          </p>
          {destino && (
            <p className="truncate pl-5.5 text-xs text-muted-foreground">
              para {destino.nome}
              {destino.telefone ? ` · ${destino.telefone}` : ""}
            </p>
          )}
        </div>
        {!aberto && (
          <Button type="button" size="sm" variant="outline" onClick={abrir} disabled={pending || Boolean(semTelefone)}>
            <Clock className="size-3.5" />
            Agendar mensagem
          </Button>
        )}
      </div>

      {semTelefone && <p className="text-xs text-destructive">{destino.nome} não tem telefone cadastrado — cadastre o WhatsApp pra agendar.</p>}

      {dados.agendadas.length > 0 && (
        <ul className="space-y-1.5">
          {dados.agendadas.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-2 text-xs">
              <div className="min-w-0 space-y-0.5">
                <p className={a.status === "PENDENTE" ? "font-medium text-primary" : "font-medium text-success"}>
                  {a.status === "PENDENTE" ? (
                    <>
                      <Clock className="mr-1 inline size-3.5" />
                      Sai {quandoMensagem(a.agendadaPara)}
                    </>
                  ) : (
                    <>
                      <CheckCheck className="mr-1 inline size-3.5" />
                      Enviada {quandoMensagem(a.agendadaPara)}
                    </>
                  )}
                </p>
                <p className="line-clamp-2 whitespace-pre-line text-muted-foreground">{a.texto}</p>
              </div>
              {a.status === "PENDENTE" && (
                <button type="button" onClick={() => cancelar(a.id)} disabled={pending} title="Cancelar mensagem" className="shrink-0 text-muted-foreground hover:text-destructive">
                  <X className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {aberto && (
        <div className="space-y-3 rounded-md border p-3">
          {!destino && (
            <div className="space-y-1.5">
              <Label htmlFor={`contato-msg-${tarefaId}`}>Para quem</Label>
              <SeletorContatoMensagem idCampo={`contato-msg-${tarefaId}`} valor={contato} onChange={setContato} />
              <p className="text-xs text-muted-foreground">O contato escolhido fica ligado a esta tarefa.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`texto-msg-${tarefaId}`}>Mensagem</Label>
            <Textarea id={`texto-msg-${tarefaId}`} value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="Ex.: Oi! Conseguiu ver o orçamento que te mandei?" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`quando-msg-${tarefaId}`}>Quando enviar (horário de Brasília)</Label>
            <Input id={`quando-msg-${tarefaId}`} type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} className="w-56" />
            <p className="text-xs text-muted-foreground">Vazio = no prazo da tarefa.</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={agendar} disabled={pending || !texto.trim() || (!destino && !contato)}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Clock className="size-3.5" />}
              Agendar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(false)} disabled={pending}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
