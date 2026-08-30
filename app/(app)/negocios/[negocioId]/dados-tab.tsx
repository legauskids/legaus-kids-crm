"use client";

import { useActionState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { atualizarDadosNegocioAction, type AtualizarDadosState } from "@/app/(app)/negocios/actions";

type Negocio = {
  id: string;
  valorCentavos: number;
  produto: string | null;
  descricao: string | null;
  formaPagamento: string | null;
  dataInicio: Date;
  previsaoFechamento: Date | null;
  origem: string | null;
  responsavel: { id: string; nome: string };
  progressoProducao: number | null;
  previsaoProducao: Date | null;
  dataInstalacao: Date | null;
  equipeInstalacao: string | null;
};

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

const initialState: AtualizarDadosState = {};

export function DadosTab({
  negocio,
  usuarios,
  isFunilPosVenda,
}: {
  negocio: Negocio;
  usuarios: { id: string; nome: string }[];
  isFunilPosVenda: boolean;
}) {
  const [state, formAction, pending] = useActionState(atualizarDadosNegocioAction, initialState);

  return (
    <Card className="mt-4">
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="negocioId" value={negocio.id} />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="valorReais">Valor (R$)</Label>
              <Input
                id="valorReais"
                name="valorReais"
                type="number"
                min="0"
                step="0.01"
                defaultValue={(negocio.valorCentavos / 100).toFixed(2)}
              />
            </div>
            <div className="space-y-2">
              <Label>Responsável</Label>
              <Input value={negocio.responsavel.nome} disabled />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data de início</Label>
              <Input value={toDateInputValue(negocio.dataInicio)} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="previsaoFechamento">Previsão de fechamento</Label>
              <Input
                id="previsaoFechamento"
                name="previsaoFechamento"
                type="date"
                defaultValue={toDateInputValue(negocio.previsaoFechamento)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="produto">Produto</Label>
              <Input id="produto" name="produto" defaultValue={negocio.produto ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="origem">Origem</Label>
              <Input id="origem" name="origem" defaultValue={negocio.origem ?? ""} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea id="descricao" name="descricao" rows={3} defaultValue={negocio.descricao ?? ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="formaPagamento">Forma de pagamento</Label>
            <Input
              id="formaPagamento"
              name="formaPagamento"
              placeholder="ex: à vista via PIX, no ato da assinatura"
              defaultValue={negocio.formaPagamento ?? ""}
            />
            <p className="text-xs text-muted-foreground">Necessário pra marcar o negócio como Ganho — vai direto pro contrato.</p>
          </div>

          {isFunilPosVenda && (
            <div className="space-y-4 border-t pt-4">
              <p className="text-sm font-medium">Produção &amp; instalação</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="progressoProducao">Progresso de produção (%)</Label>
                  <Input
                    id="progressoProducao"
                    name="progressoProducao"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue={negocio.progressoProducao ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="previsaoProducao">Previsão de produção 🔧</Label>
                  <Input
                    id="previsaoProducao"
                    name="previsaoProducao"
                    type="date"
                    defaultValue={toDateInputValue(negocio.previsaoProducao)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dataInstalacao">Data de instalação 🚚</Label>
                  <Input
                    id="dataInstalacao"
                    name="dataInstalacao"
                    type="date"
                    defaultValue={toDateInputValue(negocio.dataInstalacao)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="equipeInstalacao">Equipe terceirizada</Label>
                  <Input
                    id="equipeInstalacao"
                    name="equipeInstalacao"
                    defaultValue={negocio.equipeInstalacao ?? ""}
                  />
                </div>
              </div>
            </div>
          )}

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          {state.success && <p className="text-sm text-emerald-600">Dados salvos.</p>}

          <Button type="submit" disabled={pending}>
            {pending ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
