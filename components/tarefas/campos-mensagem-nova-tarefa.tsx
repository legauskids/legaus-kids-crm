"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SeletorContatoMensagem, type ContatoEscolhido } from "@/components/tarefas/seletor-contato-mensagem";

/**
 * "Agendar mensagem no WhatsApp" já na criação da tarefa. Campos do
 * formulário: mensagemAtiva, mensagemTexto, mensagemQuando (vazio = no
 * prazo) e mensagemContatoId (só quando a tarefa não tem contato e foi
 * escolhido aqui). destino: o contato do negócio; "escolher" = tarefa
 * avulsa, escolhe aqui.
 */
export function CamposMensagemNovaTarefa({
  idPrefixo,
  destino,
}: {
  idPrefixo: string;
  destino: { nome: string; telefone: string | null } | "escolher" | "sem-contato";
}) {
  const [ativa, setAtiva] = useState(false);
  const [contato, setContato] = useState<ContatoEscolhido | null>(null);
  const bloqueada = destino === "sem-contato" || (typeof destino === "object" && !destino.telefone);

  return (
    <div className="space-y-3 rounded-md border p-3">
      <label className={`flex items-center gap-2 text-sm font-medium ${bloqueada ? "opacity-60" : ""}`}>
        <Checkbox checked={ativa && !bloqueada} disabled={bloqueada} onCheckedChange={(v) => setAtiva(v === true)} />
        <MessageCircle className="size-4 text-primary" />
        Agendar mensagem no WhatsApp
        {typeof destino === "object" && <span className="font-normal text-muted-foreground">· para {destino.nome}</span>}
      </label>
      {destino === "sem-contato" && <p className="text-xs text-muted-foreground">O negócio não tem contato — a mensagem não teria pra quem ir.</p>}
      {typeof destino === "object" && !destino.telefone && <p className="text-xs text-muted-foreground">{destino.nome} não tem telefone cadastrado.</p>}

      {ativa && !bloqueada && (
        <>
          <input type="hidden" name="mensagemAtiva" value="on" />
          {destino === "escolher" && (
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefixo}-contato-msg`}>Para quem</Label>
              <SeletorContatoMensagem idCampo={`${idPrefixo}-contato-msg`} valor={contato} onChange={setContato} />
              {contato && <input type="hidden" name="mensagemContatoId" value={contato.id} />}
              <p className="text-xs text-muted-foreground">O contato escolhido fica ligado à tarefa.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefixo}-texto-msg`}>Mensagem</Label>
            <Textarea id={`${idPrefixo}-texto-msg`} name="mensagemTexto" rows={3} placeholder="Ex.: Oi! Conseguiu ver o orçamento que te mandei?" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefixo}-quando-msg`}>Quando enviar (horário de Brasília)</Label>
            <Input id={`${idPrefixo}-quando-msg`} name="mensagemQuando" type="datetime-local" className="w-56" />
            <p className="text-xs text-muted-foreground">Vazio = no prazo da tarefa.</p>
          </div>
        </>
      )}
    </div>
  );
}
