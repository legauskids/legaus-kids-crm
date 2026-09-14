"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search } from "lucide-react";
import { buscarCnpjAction } from "@/app/(app)/cadastros/actions";
import { completarDadosContratoEGanharAction, type CompletarDadosContratoState } from "@/app/(app)/negocios/actions";

export type ContatoParaContrato = {
  id: string;
  nome: string;
  cnpj: string | null;
  razaoSocial: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  representanteLegalNome: string | null;
  representanteLegalCpf: string | null;
};

const initialState: CompletarDadosContratoState = {};

export function CompletarDadosContratoDialog({
  open,
  onOpenChange,
  negocioId,
  etapaGanhoId,
  contato,
  formaPagamentoAtual,
  avisoInicial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  negocioId: string;
  etapaGanhoId: string;
  contato: ContatoParaContrato;
  formaPagamentoAtual: string | null;
  avisoInicial?: string | null;
}) {
  const [state, formAction, pending] = useActionState(completarDadosContratoEGanharAction, initialState);
  const [buscandoCnpj, startBuscaCnpj] = useTransition();
  const [erroCnpj, setErroCnpj] = useState<string | null>(null);

  useEffect(() => {
    if (state.success) onOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  function buscar() {
    const input = document.getElementById("cnpj-ganho") as HTMLInputElement | null;
    if (!input?.value) return;
    setErroCnpj(null);
    startBuscaCnpj(async () => {
      const resultado = await buscarCnpjAction(input.value);
      if (resultado.error) {
        setErroCnpj(resultado.error);
        return;
      }
      if (resultado.dados) {
        (document.getElementById("razaoSocial-ganho") as HTMLInputElement).value = resultado.dados.razaoSocial;
        (document.getElementById("endereco-ganho") as HTMLInputElement).value = resultado.dados.endereco;
        (document.getElementById("cidade-ganho") as HTMLInputElement).value = resultado.dados.cidade;
        (document.getElementById("uf-ganho") as HTMLInputElement).value = resultado.dados.uf;
        (document.getElementById("cep-ganho") as HTMLInputElement).value = resultado.dados.cep;
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Completar dados pro contrato</DialogTitle>
          <DialogDescription>
            Pra marcar como Ganho, o contrato precisa desses dados de {contato.nome}. Os campos já preenchidos no cadastro do
            cliente vieram prontos — só falta completar o resto.
          </DialogDescription>
        </DialogHeader>

        {avisoInicial && <p className="text-sm text-destructive">{avisoInicial}</p>}

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="negocioId" value={negocioId} />
          <input type="hidden" name="etapaGanhoId" value={etapaGanhoId} />
          <input type="hidden" name="contatoId" value={contato.id} />

          <div className="space-y-2 rounded-lg border p-3">
            <Label htmlFor="cnpj-ganho">CNPJ</Label>
            <div className="flex gap-2">
              <Input id="cnpj-ganho" name="cnpj" defaultValue={contato.cnpj ?? ""} placeholder="00.000.000/0000-00" />
              <Button type="button" variant="outline" disabled={buscandoCnpj} onClick={buscar}>
                {buscandoCnpj ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                Buscar
              </Button>
            </div>
            {erroCnpj && <p className="text-xs text-destructive">{erroCnpj}</p>}
            <p className="text-xs text-muted-foreground">Digite o CNPJ e clique em Buscar pra puxar razão social e endereço automaticamente.</p>
            <div className="space-y-2 pt-1">
              <Label htmlFor="razaoSocial-ganho">Razão social</Label>
              <Input id="razaoSocial-ganho" name="razaoSocial" defaultValue={contato.razaoSocial ?? ""} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="endereco-ganho">Endereço</Label>
            <Input id="endereco-ganho" name="endereco" defaultValue={contato.endereco ?? ""} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cidade-ganho">Cidade</Label>
              <Input id="cidade-ganho" name="cidade" defaultValue={contato.cidade ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="uf-ganho">UF</Label>
              <Input id="uf-ganho" name="uf" defaultValue={contato.uf ?? ""} maxLength={2} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cep-ganho">CEP</Label>
              <Input id="cep-ganho" name="cep" defaultValue={contato.cep ?? ""} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-lg border p-3">
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">Quem assina pela empresa (pro contrato)</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="representanteLegalNome-ganho">Nome do representante</Label>
              <Input id="representanteLegalNome-ganho" name="representanteLegalNome" defaultValue={contato.representanteLegalNome ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="representanteLegalCpf-ganho">CPF do representante</Label>
              <Input
                id="representanteLegalCpf-ganho"
                name="representanteLegalCpf"
                defaultValue={contato.representanteLegalCpf ?? ""}
                placeholder="000.000.000-00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="formaPagamento-ganho">Forma de pagamento</Label>
            <Input
              id="formaPagamento-ganho"
              name="formaPagamento"
              placeholder="ex: à vista via PIX, no ato da assinatura"
              defaultValue={formaPagamentoAtual ?? ""}
            />
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : "Salvar e marcar como Ganho"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
