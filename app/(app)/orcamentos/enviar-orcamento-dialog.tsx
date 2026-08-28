"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, MessageCircle, Mail, Check } from "lucide-react";
import { enviarOrcamentoWhatsAppAction, enviarOrcamentoEmailAction } from "@/app/(app)/orcamentos/actions";

export function EnviarOrcamentoDialog({
  orcamentoId,
  telefoneInicial,
  emailInicial,
  emailHabilitado,
}: {
  orcamentoId: string;
  telefoneInicial: string | null;
  emailInicial: string | null;
  emailHabilitado: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [telefone, setTelefone] = useState(telefoneInicial ?? "");
  const [email, setEmail] = useState(emailInicial ?? "");
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  function enviarWhatsApp() {
    setErro(null);
    setSucesso(null);
    startTransition(async () => {
      const resultado = await enviarOrcamentoWhatsAppAction(orcamentoId, telefone);
      if ("error" in resultado) {
        setErro(resultado.error);
        return;
      }
      setSucesso("Mensagem entrou na fila de envio do WhatsApp.");
    });
  }

  function enviarEmail() {
    setErro(null);
    setSucesso(null);
    startTransition(async () => {
      const resultado = await enviarOrcamentoEmailAction(orcamentoId, email);
      if ("error" in resultado) {
        setErro(resultado.error);
        return;
      }
      setSucesso("E-mail enviado.");
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setErro(null);
          setSucesso(null);
        }
      }}
    >
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Send className="size-4" />
        Enviar
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar orçamento</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="whatsapp">
          <TabsList className="w-full">
            <TabsTrigger value="whatsapp" className="flex-1">
              <MessageCircle className="size-4" />
              WhatsApp
            </TabsTrigger>
            <TabsTrigger value="email" className="flex-1">
              <Mail className="size-4" />
              E-mail
            </TabsTrigger>
          </TabsList>

          <TabsContent value="whatsapp" className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="telefone-envio">Telefone (com DDD)</Label>
              <Input
                id="telefone-envio"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="55999999999"
              />
              <p className="text-xs text-muted-foreground">
                A mensagem entra na fila do WhatsApp e é enviada pelo número da Legaus Kids assim que o serviço de conexão
                processar.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={enviarWhatsApp} disabled={pending || !telefone.trim()}>
                {pending ? "Enviando..." : "Enviar pelo WhatsApp"}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="email" className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="email-envio">E-mail do destinatário</Label>
              <Input
                id="email-envio"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cliente@empresa.com.br"
                disabled={!emailHabilitado}
              />
              {!emailHabilitado && (
                <p className="text-xs text-destructive">Envio de e-mail ainda não configurado nesse ambiente.</p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={enviarEmail} disabled={pending || !email.trim() || !emailHabilitado}>
                {pending ? "Enviando..." : "Enviar por e-mail"}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>

        {erro && <p className="text-sm text-destructive">{erro}</p>}
        {sucesso && (
          <p className="flex items-center gap-1.5 text-sm text-success">
            <Check className="size-4" />
            {sucesso}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
