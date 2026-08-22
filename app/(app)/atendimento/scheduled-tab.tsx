"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import { cancelarAgendadaAction } from "@/app/(app)/atendimento/actions";
import { AgendarDialog } from "@/app/(app)/atendimento/agendar-dialog";
import type { AgendadaVM } from "@/app/(app)/atendimento/types";

const STATUS_LABEL: Record<string, string> = {
  PENDENTE: "Pendente",
  ENVIADA: "Enviada",
  CANCELADA: "Cancelada",
};

export function ScheduledTab({ conversaId, agendadas }: { conversaId: string; agendadas: AgendadaVM[] }) {
  const router = useRouter();
  const [novaAberta, setNovaAberta] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {agendadas.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">Nenhuma mensagem agendada.</p>
        )}
        {agendadas.map((a) => (
          <div key={a.id} className="flex items-start justify-between gap-2 rounded-md border p-3 text-sm">
            <div>
              <p className="whitespace-pre-wrap">{a.texto}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{new Date(a.agendadaPara).toLocaleString("pt-BR")}</span>
                <Badge variant={a.status === "PENDENTE" ? "outline" : "secondary"}>{STATUS_LABEL[a.status]}</Badge>
              </div>
            </div>
            {a.status === "PENDENTE" && (
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                title="Cancelar"
                onClick={() =>
                  startTransition(async () => {
                    await cancelarAgendadaAction(a.id);
                    router.refresh();
                  })
                }
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>
      <div className="border-t p-3">
        <Button variant="outline" size="sm" onClick={() => setNovaAberta(true)}>
          <Plus className="size-3.5" />
          Nova mensagem agendada
        </Button>
      </div>

      <AgendarDialog
        open={novaAberta}
        onOpenChange={setNovaAberta}
        conversaId={conversaId}
        textoInicial=""
        onScheduled={() => router.refresh()}
      />
    </div>
  );
}
