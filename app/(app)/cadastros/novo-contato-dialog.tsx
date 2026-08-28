"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
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
import { Loader2, Search } from "lucide-react";
import { criarContatoAction, buscarCnpjAction, type ContatoFormState } from "@/app/(app)/cadastros/actions";
import type { TipoContato } from "@prisma/client";

const initialState: ContatoFormState = {};

const TITULO: Record<TipoContato, string> = {
  CONTATO: "Novo contato",
  CLIENTE: "Novo cliente",
  FORNECEDOR: "Novo fornecedor",
};

export function NovoContatoDialog({
  open,
  onOpenChange,
  tipo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipo: TipoContato;
}) {
  const [state, formAction, pending] = useActionState(criarContatoAction, initialState);
  const ehEmpresa = tipo !== "CONTATO";

  const [cnpj, setCnpj] = useState("");
  const [buscandoCnpj, startBuscaCnpj] = useTransition();
  const [erroCnpj, setErroCnpj] = useState<string | null>(null);
  const [dadosCnpj, setDadosCnpj] = useState<{
    razaoSocial: string;
    telefone: string;
    endereco: string;
    cidade: string;
    uf: string;
    cep: string;
  } | null>(null);

  useEffect(() => {
    if (state.success) onOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  function buscar() {
    setErroCnpj(null);
    startBuscaCnpj(async () => {
      const resultado = await buscarCnpjAction(cnpj);
      if (resultado.error) {
        setErroCnpj(resultado.error);
        return;
      }
      if (resultado.dados) {
        setDadosCnpj({
          razaoSocial: resultado.dados.razaoSocial,
          telefone: resultado.dados.telefone ?? "",
          endereco: resultado.dados.endereco,
          cidade: resultado.dados.cidade,
          uf: resultado.dados.uf,
          cep: resultado.dados.cep,
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{TITULO[tipo]}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4" key={dadosCnpj ? "com-cnpj" : "sem-cnpj"}>
          <input type="hidden" name="tipo" value={tipo} />

          {ehEmpresa && (
            <div className="space-y-2 rounded-lg border p-3">
              <Label htmlFor="cnpj-novo">CNPJ</Label>
              <div className="flex gap-2">
                <Input
                  id="cnpj-novo"
                  name="cnpj"
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value)}
                  placeholder="00.000.000/0000-00"
                />
                <Button type="button" variant="outline" disabled={buscandoCnpj || !cnpj} onClick={buscar}>
                  {buscandoCnpj ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                  Buscar
                </Button>
              </div>
              {erroCnpj && <p className="text-xs text-destructive">{erroCnpj}</p>}
              {dadosCnpj && <p className="text-xs text-success">Dados encontrados — confira e ajuste abaixo antes de salvar.</p>}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="nome-novo">{ehEmpresa ? "Nome fantasia" : "Nome"}</Label>
            <Input id="nome-novo" name="nome" defaultValue={dadosCnpj?.razaoSocial ?? ""} required />
          </div>

          {ehEmpresa && (
            <div className="space-y-2">
              <Label htmlFor="razaoSocial-novo">Razão social</Label>
              <Input id="razaoSocial-novo" name="razaoSocial" defaultValue={dadosCnpj?.razaoSocial ?? ""} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="telefone-novo">Telefone</Label>
              <Input id="telefone-novo" name="telefone" defaultValue={dadosCnpj?.telefone ?? ""} placeholder="55999999999" />
            </div>
            {ehEmpresa ? (
              <div className="space-y-2">
                <Label htmlFor="email-novo">E-mail</Label>
                <Input id="email-novo" name="email" type="email" placeholder="contato@empresa.com.br" />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="empresa-novo">Empresa</Label>
                <Input id="empresa-novo" name="empresa" />
              </div>
            )}
          </div>

          {ehEmpresa && (
            <>
              <div className="space-y-2">
                <Label htmlFor="endereco-novo">Endereço</Label>
                <Input id="endereco-novo" name="endereco" defaultValue={dadosCnpj?.endereco ?? ""} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cidade-novo">Cidade</Label>
                  <Input id="cidade-novo" name="cidade" defaultValue={dadosCnpj?.cidade ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="uf-novo">UF</Label>
                  <Input id="uf-novo" name="uf" defaultValue={dadosCnpj?.uf ?? ""} maxLength={2} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cep-novo">CEP</Label>
                  <Input id="cep-novo" name="cep" defaultValue={dadosCnpj?.cep ?? ""} />
                </div>
              </div>
            </>
          )}

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
