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
import { Loader2, Search, Trash2 } from "lucide-react";
import { atualizarContatoAction, excluirContatoAction, buscarCnpjAction, type ContatoFormState } from "@/app/(app)/cadastros/actions";
import type { ContatoVM } from "@/app/(app)/cadastros/lista-contatos";

const initialState: ContatoFormState = {};

export function EditarContatoDialog({
  contato,
  onOpenChange,
}: {
  contato: ContatoVM | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState(atualizarContatoAction, initialState);
  const ehEmpresa = contato?.tipo !== "CONTATO";
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [buscandoCnpj, startBuscaCnpj] = useTransition();
  const [erroCnpj, setErroCnpj] = useState<string | null>(null);

  useEffect(() => {
    if (state.success) onOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  function buscar(cnpjInputId: string) {
    const input = document.getElementById(cnpjInputId) as HTMLInputElement | null;
    if (!input?.value) return;
    setErroCnpj(null);
    startBuscaCnpj(async () => {
      const resultado = await buscarCnpjAction(input.value);
      if (resultado.error) {
        setErroCnpj(resultado.error);
        return;
      }
      if (resultado.dados) {
        (document.getElementById("razaoSocial-editar") as HTMLInputElement).value = resultado.dados.razaoSocial;
        (document.getElementById("endereco-editar") as HTMLInputElement).value = resultado.dados.endereco;
        (document.getElementById("cidade-editar") as HTMLInputElement).value = resultado.dados.cidade;
        (document.getElementById("uf-editar") as HTMLInputElement).value = resultado.dados.uf;
        (document.getElementById("cep-editar") as HTMLInputElement).value = resultado.dados.cep;
      }
    });
  }

  return (
    <Dialog open={contato != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar {ehEmpresa ? (contato?.tipo === "CLIENTE" ? "cliente" : "fornecedor") : "contato"}</DialogTitle>
        </DialogHeader>
        {contato && (
          <form action={formAction} className="space-y-4" key={contato.id}>
            <input type="hidden" name="contatoId" value={contato.id} />

            <div className="space-y-2">
              <Label htmlFor="nome-editar">{ehEmpresa ? "Nome fantasia" : "Nome"}</Label>
              <Input id="nome-editar" name="nome" defaultValue={contato.nome} required />
            </div>

            {ehEmpresa && (
              <div className="space-y-2 rounded-lg border p-3">
                <Label htmlFor="cnpj-editar">CNPJ</Label>
                <div className="flex gap-2">
                  <Input id="cnpj-editar" name="cnpj" defaultValue={contato.cnpj ?? ""} placeholder="00.000.000/0000-00" />
                  <Button type="button" variant="outline" disabled={buscandoCnpj} onClick={() => buscar("cnpj-editar")}>
                    {buscandoCnpj ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                    Buscar
                  </Button>
                </div>
                {erroCnpj && <p className="text-xs text-destructive">{erroCnpj}</p>}
                <div className="space-y-2 pt-1">
                  <Label htmlFor="razaoSocial-editar">Razão social</Label>
                  <Input id="razaoSocial-editar" name="razaoSocial" defaultValue={contato.razaoSocial ?? ""} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="telefone-editar">Telefone</Label>
                <Input id="telefone-editar" name="telefone" defaultValue={contato.telefone ?? ""} />
              </div>
              {ehEmpresa ? (
                <div className="space-y-2">
                  <Label htmlFor="email-editar">E-mail</Label>
                  <Input id="email-editar" name="email" type="email" defaultValue={contato.email ?? ""} placeholder="contato@empresa.com.br" />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="empresa-editar">Empresa</Label>
                  <Input id="empresa-editar" name="empresa" defaultValue={contato.empresa ?? ""} />
                </div>
              )}
            </div>

            {ehEmpresa && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="endereco-editar">Endereço</Label>
                  <Input id="endereco-editar" name="endereco" defaultValue={contato.endereco ?? ""} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cidade-editar">Cidade</Label>
                    <Input id="cidade-editar" name="cidade" defaultValue={contato.cidade ?? ""} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="uf-editar">UF</Label>
                    <Input id="uf-editar" name="uf" defaultValue={contato.uf ?? ""} maxLength={2} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cep-editar">CEP</Label>
                    <Input id="cep-editar" name="cep" defaultValue={contato.cep ?? ""} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 rounded-lg border p-3">
                  <div className="col-span-2">
                    <Label className="text-xs text-muted-foreground">Quem assina pela empresa (pro contrato)</Label>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="representanteLegalNome-editar">Nome do representante</Label>
                    <Input id="representanteLegalNome-editar" name="representanteLegalNome" defaultValue={contato.representanteLegalNome ?? ""} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="representanteLegalCpf-editar">CPF do representante</Label>
                    <Input id="representanteLegalCpf-editar" name="representanteLegalCpf" defaultValue={contato.representanteLegalCpf ?? ""} placeholder="000.000.000-00" />
                  </div>
                </div>
              </>
            )}

            {!ehEmpresa && (
              <div className="space-y-2">
                <Label htmlFor="tags-editar">Etiquetas (separadas por vírgula)</Label>
                <Input id="tags-editar" name="tags" defaultValue={contato.tags.join(", ")} placeholder="cliente, vip..." />
              </div>
            )}

            {state.error && <p className="text-sm text-destructive">{state.error}</p>}

            <DialogFooter className="justify-between sm:justify-between">
              {confirmandoExclusao ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => excluirContatoAction(contato.id).then(() => onOpenChange(false))}
                  >
                    Confirmar exclusão
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmandoExclusao(false)}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmandoExclusao(true)}>
                  <Trash2 className="size-3.5" />
                  Excluir
                </Button>
              )}
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
