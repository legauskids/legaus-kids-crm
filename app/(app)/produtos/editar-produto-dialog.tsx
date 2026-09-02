"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Upload, Loader2 } from "lucide-react";
import {
  atualizarProdutoAction,
  excluirProdutoAction,
  uploadFotoProdutoAction,
  type ProdutoFormState,
} from "@/app/(app)/produtos/actions";
import type { ProdutoVM } from "@/app/(app)/produtos/produtos-shell";

const initialState: ProdutoFormState = {};

export function EditarProdutoDialog({
  produto,
  onOpenChange,
}: {
  produto: ProdutoVM | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(atualizarProdutoAction, initialState);
  const [ativo, setAtivo] = useState(produto?.ativo ?? true);
  const [imagemUrl, setImagemUrl] = useState(produto?.imagemUrl ?? "");
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [enviandoFoto, startEnvioFoto] = useTransition();
  const [erroFoto, setErroFoto] = useState<string | null>(null);
  // Separado de `imagemUrl` (o valor de verdade, submetido no form) — só pra
  // furar o cache do navegador na prévia assim que uma foto nova é enviada,
  // já que a rota /api/imagem/produto/{id} sempre serve a mesma URL.
  const [previewCacheBust, setPreviewCacheBust] = useState<string | null>(null);
  const inputFotoRef = useRef<HTMLInputElement>(null);

  function enviarFoto(arquivo: File) {
    if (!produto) return;
    setErroFoto(null);
    startEnvioFoto(async () => {
      const formData = new FormData();
      formData.append("foto", arquivo);
      const resultado = await uploadFotoProdutoAction(produto.id, formData);
      if ("error" in resultado) {
        setErroFoto(resultado.error);
        return;
      }
      setImagemUrl(resultado.imagemUrl);
      setPreviewCacheBust(`${resultado.imagemUrl}?t=${Date.now()}`);
      router.refresh();
    });
  }

  useEffect(() => {
    if (state.success) onOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <Dialog open={produto != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar produto</DialogTitle>
        </DialogHeader>
        {produto && (
          <form action={formAction} className="space-y-4" key={produto.id}>
            <input type="hidden" name="produtoId" value={produto.id} />
            <input type="hidden" name="ativo" value={String(ativo)} />

            {imagemUrl && (
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewCacheBust ?? imagemUrl}
                  alt={produto.nome}
                  className="h-32 w-32 rounded-lg border object-contain bg-muted/30"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              </div>
            )}

            <div className="flex items-center justify-center gap-2">
              <input
                ref={inputFotoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const arquivo = e.target.files?.[0];
                  if (arquivo) enviarFoto(arquivo);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={enviandoFoto}
                onClick={() => inputFotoRef.current?.click()}
              >
                {enviandoFoto ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                {enviandoFoto ? "Enviando..." : "Enviar foto"}
              </Button>
            </div>
            {erroFoto && <p className="text-center text-xs text-destructive">{erroFoto}</p>}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nome-editar">Nome</Label>
                <Input id="nome-editar" name="nome" defaultValue={produto.nome} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="codigo-editar">Código</Label>
                <Input id="codigo-editar" name="codigo" defaultValue={produto.codigo ?? ""} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="categoria-editar">Categoria</Label>
              <Input id="categoria-editar" name="categoria" defaultValue={produto.categoria} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="imagem-editar">URL da imagem</Label>
              <Input
                id="imagem-editar"
                name="imagemUrl"
                value={imagemUrl}
                onChange={(e) => setImagemUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="descricao-editar">Descrição</Label>
              <Textarea id="descricao-editar" name="descricao" rows={3} defaultValue={produto.descricao ?? ""} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="valor-editar">Valor (R$)</Label>
              <Input
                id="valor-editar"
                name="valorReais"
                type="number"
                min="0"
                step="0.01"
                defaultValue={produto.valorCentavos != null ? (produto.valorCentavos / 100).toFixed(2) : ""}
                placeholder="Deixe em branco se não souber ainda"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={ativo} onCheckedChange={(v) => setAtivo(v === true)} />
              Ativo (aparece pra escolher em orçamentos)
            </label>

            {state.error && <p className="text-sm text-destructive">{state.error}</p>}

            <DialogFooter className="justify-between sm:justify-between">
              {confirmandoExclusao ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      excluirProdutoAction(produto.id).then(() => {
                        onOpenChange(false);
                        router.refresh();
                      })
                    }
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
