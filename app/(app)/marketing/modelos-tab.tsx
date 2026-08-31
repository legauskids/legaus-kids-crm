"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { salvarModeloAction, criarModeloAction, excluirModeloAction, type ModeloFormState } from "@/app/(app)/marketing/actions";
import { TIPO_POSTAGEM_LABEL, type ModeloPostagemVM } from "@/app/(app)/marketing/types";

function ModeloCard({ modelo }: { modelo: ModeloPostagemVM }) {
  const router = useRouter();
  const [texto, setTexto] = useState(modelo.legendaModelo);
  const [salvando, startSalvar] = useTransition();
  const [excluindo, startExcluir] = useTransition();

  function salvar() {
    startSalvar(async () => {
      await salvarModeloAction(modelo.id, texto);
      router.refresh();
    });
  }

  function excluir() {
    startExcluir(async () => {
      await excluirModeloAction(modelo.id);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-2.5 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{modelo.titulo}</p>
            <Badge variant="outline" className="text-[10px]">
              {TIPO_POSTAGEM_LABEL[modelo.tipo]}
            </Badge>
          </div>
          <button
            type="button"
            onClick={excluir}
            disabled={excluindo}
            className="text-muted-foreground hover:text-destructive"
            title="Excluir modelo"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} className="font-mono text-xs" />
        {texto !== modelo.legendaModelo && (
          <Button size="sm" variant="outline" disabled={salvando} onClick={salvar}>
            {salvando ? <Loader2 className="size-3.5 animate-spin" /> : "Salvar modelo"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

const initialState: ModeloFormState = {};

function NovoModeloForm() {
  const [state, formAction, pending] = useActionState(criarModeloAction, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Novo modelo</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-3">
          <Input name="titulo" placeholder="Título (ex: Promoção de fim de ano)" required />
          <select name="tipo" required defaultValue="" className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="" disabled>
              Tipo de postagem...
            </option>
            {Object.entries(TIPO_POSTAGEM_LABEL).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
          <Textarea name="legendaModelo" rows={4} placeholder="Texto do modelo, com {{campos}} se quiser" required className="font-mono text-xs" />
          {state.error && <p className="text-xs text-destructive">{state.error}</p>}
          <Button type="submit" size="sm" disabled={pending}>
            <Plus className="size-3.5" />
            Criar modelo
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function ModelosTab({ modelos }: { modelos: ModeloPostagemVM[] }) {
  return (
    <div className="flex-1 space-y-3 p-6">
      <p className="text-xs text-muted-foreground">
        Esses modelos servem de referência de tom e estrutura — a legenda sugerida pela IA já segue esse estilo automaticamente, mas
        você pode copiar um modelo na hora de escrever o contexto de uma postagem nova.
      </p>
      {modelos.map((m) => (
        <ModeloCard key={m.id} modelo={m} />
      ))}
      <NovoModeloForm />
    </div>
  );
}
