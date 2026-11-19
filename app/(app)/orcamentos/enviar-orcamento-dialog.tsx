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
import { CampoDestinatario, useDestinatario } from "@/components/shared/destinatario-whatsapp";
import { enviarOrcamentoWhatsAppAction, enviarOrcamentoEmailAction } from "@/app/(app)/orcamentos/actions";
import { textoEnvioOrcamentoWhatsApp } from "@/lib/utils/orcamento-mensagem";
import type { DestinatarioEnvio } from "@/lib/utils/destinatario";

export function EnviarOrcamentoDialog({
  orcamentoId,
  numero,
  destinatarioInicial,
  emailInicial,
  emailHabilitado,
}: {
  orcamentoId: string;
  numero: number;
  destinatarioInicial: DestinatarioEnvio | null;
  emailInicial: string | null;
  emailHabilitado: boolean;
}) {
  const [open, setOpen] = useState(false);
  const destinatario = useDestinatario(destinatarioInicial);
  const [email, setEmail] = useState(emailInicial ?? "");
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const escolha = destinatario.escolha;

  function enviarWhatsApp() {
    if (!escolha) return;
    setErro(null);
    setSucesso(null);
    startTransition(async () => {
      const resultado = await enviarOrcamentoWhatsAppAction(orcamentoId, escolha.telefone, escolha.nome).catch(() => ({
        error: "Não foi possível enviar agora — confira a internet e tente de novo.",
      }));
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
              <Label htmlFor="destino-orcamento">Para</Label>
              <CampoDestinatario id="destino-orcamento" estado={destinatario} disabled={pending} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Vai o PDF do orçamento com esta mensagem:</p>
              <p className="whitespace-pre-line rounded-md border bg-muted/30 px-3 py-2 text-sm">{textoEnvioOrcamentoWhatsApp(numero).replace(/\*/g, "")}</p>
            </div>
            <DialogFooter>
              <Button onClick={enviarWhatsApp} disabled={pending || !escolha}>
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
