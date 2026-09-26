"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { criarReuniaoAction } from "@/app/(app)/reunioes/actions";

/**
 * Cria a reunião e abre o painel dela. O que ficou pendente/adiado na última
 * reunião encerrada já entra na pauta; a pauta sugerida pela IA é gerada lá
 * dentro (de preferência na véspera, pra dar tempo de todo mundo opinar).
 */
export function NovaReuniaoForm({ dataHoraPadrao }: { dataHoraPadrao: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tipo, setTipo] = useState<"SEMANAL" | "MENSAL">("SEMANAL");
  const [dataHora, setDataHora] = useState(dataHoraPadrao);
  const [titulo, setTitulo] = useState("");

  function criar() {
    startTransition(async () => {
      const r = await criarReuniaoAction(tipo, dataHora, titulo);
      if (r.error || !r.id) {
        toast.error(r.error ?? "Não consegui criar a reunião.");
        return;
      }
      router.push(`/reunioes/${r.id}`);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Nova reunião</CardTitle>
        <p className="text-xs text-muted-foreground">
          Semanal: analisa os 7 dias anteriores e olha os 7 seguintes. Mensal: até o dia 15 analisa o mês anterior; depois, o mês corrente — e
          projeta o mês seguinte.
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as "SEMANAL" | "MENSAL")}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          aria-label="Tipo da reunião"
        >
          <option value="SEMANAL">Semanal</option>
          <option value="MENSAL">Mensal</option>
        </select>
        <Input
          type="datetime-local"
          value={dataHora}
          onChange={(e) => setDataHora(e.target.value)}
          className="h-9 w-52"
          aria-label="Dia e horário"
        />
        <Input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Título (opcional — ex.: Reunião semanal — 28/09)"
          className="h-9 min-w-56 flex-1"
        />
        <Button size="sm" onClick={criar} disabled={pending || !dataHora}>
          <Plus className="size-3.5" />
          {pending ? "Criando..." : "Criar e abrir"}
        </Button>
      </CardContent>
    </Card>
  );
}
