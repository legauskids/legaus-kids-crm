"use client";

import { useActionState, useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { criarProdutoAction, type ProdutoFormState } from "@/app/(app)/produtos/actions";

const NOVA_CATEGORIA = "__nova__";

const initialState: ProdutoFormState = {};

export function NovoProdutoDialog({
  open,
  onOpenChange,
  categoriasExistentes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoriasExistentes: string[];
}) {
  const [state, formAction, pending] = useActionState(criarProdutoAction, initialState);
  const [categoriaSelecionada, setCategoriaSelecionada] = useState(categoriasExistentes[0] ?? NOVA_CATEGORIA);

  useEffect(() => {
    if (state.success) onOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo produto</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome-produto">Nome</Label>
            <Input id="nome-produto" name="nome" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="codigo-produto">Código</Label>
              <Input id="codigo-produto" name="codigo" placeholder="Ex: PL-023" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="categoria-select">Categoria</Label>
              <Select value={categoriaSelecionada} onValueChange={setCategoriaSelecionada}>
                <SelectTrigger id="categoria-select" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoriasExistentes.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                  <SelectItem value={NOVA_CATEGORIA}>+ Nova categoria...</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {categoriaSelecionada === NOVA_CATEGORIA ? (
            <div className="space-y-2">
              <Label htmlFor="categoria-nova">Nome da nova categoria</Label>
              <Input id="categoria-nova" name="categoria" required />
            </div>
          ) : (
            <input type="hidden" name="categoria" value={categoriaSelecionada} />
          )}

          <div className="space-y-2">
            <Label htmlFor="descricao-produto">Descrição</Label>
            <Textarea id="descricao-produto" name="descricao" rows={2} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="valor-produto">Valor (R$)</Label>
            <Input id="valor-produto" name="valorReais" type="number" min="0" step="0.01" placeholder="Deixe em branco se não souber ainda" />
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Criando..." : "Criar produto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
