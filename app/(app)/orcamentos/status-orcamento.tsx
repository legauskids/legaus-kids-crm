"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Printer, Trash2 } from "lucide-react";
import { atualizarStatusOrcamentoAction, excluirOrcamentoAction } from "@/app/(app)/orcamentos/actions";
import { EnviarOrcamentoDialog } from "@/app/(app)/orcamentos/enviar-orcamento-dialog";
import type { StatusOrcamento } from "@prisma/client";

const OPCOES: { value: StatusOrcamento; label: string }[] = [
  { value: "RASCUNHO", label: "Rascunho" },
  { value: "ENVIADO", label: "Enviado" },
  { value: "APROVADO", label: "Aprovado" },
  { value: "RECUSADO", label: "Recusado" },
  { value: "EXPIRADO", label: "Expirado" },
];

export function ControleStatusOrcamento({
  orcamentoId,
  statusAtual,
  contatoTelefone = null,
  contatoEmail = null,
  emailHabilitado = false,
}: {
  orcamentoId: string;
  statusAtual: StatusOrcamento;
  contatoTelefone?: string | null;
  contatoEmail?: string | null;
  emailHabilitado?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={statusAtual}
        onValueChange={(v) => startTransition(() => atualizarStatusOrcamentoAction(orcamentoId, v as StatusOrcamento).then(() => router.refresh()))}
        disabled={pending}
      >
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPCOES.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" asChild>
        <Link href={`/orcamentos/${orcamentoId}/imprimir`} target="_blank">
          <Printer className="size-4" />
          Imprimir / PDF
        </Link>
      </Button>
      <EnviarOrcamentoDialog
        orcamentoId={orcamentoId}
        telefoneInicial={contatoTelefone}
        emailInicial={contatoEmail}
        emailHabilitado={emailHabilitado}
      />
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => {
          if (confirm("Excluir este orçamento? Não dá pra desfazer.")) {
            startTransition(() => excluirOrcamentoAction(orcamentoId));
          }
        }}
      >
        <Trash2 className="size-4" />
        Excluir
      </Button>
    </div>
  );
}
