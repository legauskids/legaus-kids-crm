"use client";

import { useRef, useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { adicionarNotaHistoricoAction } from "@/app/(app)/negocios/actions";

type Atividade = {
  id: string;
  tipo: string;
  texto: string;
  criadoEm: Date;
  autor: { nome: string } | null;
};

const TIPO_LABEL: Record<string, string> = {
  NOTA: "Nota",
  WHATSAPP: "WhatsApp",
  SISTEMA: "Sistema",
};

export function HistoricoTab({ negocioId, atividades }: { negocioId: string; atividades: Atividade[] }) {
  const [texto, setTexto] = useState("");
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <form
            ref={formRef}
            action={() =>
              startTransition(async () => {
                await adicionarNotaHistoricoAction(negocioId, texto);
                setTexto("");
              })
            }
            className="space-y-2"
          >
            <Textarea
              placeholder="O que foi feito e qual o próximo passo?"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <Button type="submit" size="sm" disabled={!texto.trim() || pending}>
              {pending ? "Salvando..." : "Adicionar nota"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <ul className="space-y-3">
        {atividades.map((atividade) => (
          <li key={atividade.id} className="flex gap-3 border-l-2 pl-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{TIPO_LABEL[atividade.tipo] ?? atividade.tipo}</Badge>
                <span className="text-xs text-muted-foreground">
                  {atividade.autor ? `${atividade.autor.nome} · ` : ""}
                  {atividade.criadoEm.toLocaleString("pt-BR")}
                </span>
              </div>
              <p className="mt-1 text-sm">{atividade.texto}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
