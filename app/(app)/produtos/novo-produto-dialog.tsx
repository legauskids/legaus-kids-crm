"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
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
import { Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { criarProdutoAction, type ProdutoFormState } from "@/app/(app)/produtos/actions";

const NOVA_CATEGORIA = "__nova__";
const MAX_FOTO_BYTES = 6 * 1024 * 1024;

const initialState: ProdutoFormState = {};

export function NovoProdutoDialog({
  open,
  onOpenChange,
  categoriasExistentes,
  categoriaInicial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoriasExistentes: string[];
  categoriaInicial?: string;
}) {
  const [state, formAction, pending] = useActionState(criarProdutoAction, initialState);
  const [categoriaSelecionada, setCategoriaSelecionada] = useState(
    categoriaInicial ?? categoriasExistentes[0] ?? NOVA_CATEGORIA,
  );
  const [arquivoFoto, setArquivoFoto] = useState<File | null>(null);
  const [erroFoto, setErroFoto] = useState<string | null>(null);
  const [arrastandoFoto, setArrastandoFoto] = useState(false);
  const inputFotoRef = useRef<HTMLInputElement>(null);

  // Derivado do File, não guardado em state — só a URL do object precisa de
  // limpeza (revoke), e isso é side effect puro, não setState.
  const previewFoto = useMemo(() => (arquivoFoto ? URL.createObjectURL(arquivoFoto) : null), [arquivoFoto]);
  useEffect(() => {
    return () => {
      if (previewFoto) URL.revokeObjectURL(previewFoto);
    };
  }, [previewFoto]);

  function handleOpenChange(novoOpen: boolean) {
    if (!novoOpen) {
      setArquivoFoto(null);
      setErroFoto(null);
      if (inputFotoRef.current) inputFotoRef.current.value = "";
    }
    onOpenChange(novoOpen);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fecha e limpa o rascunho só depois que o Server Action confirma sucesso
    if (state.success) handleOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  function selecionarFoto(arquivo: File) {
    setErroFoto(null);
    if (!arquivo.type.startsWith("image/")) {
      setErroFoto("Só é possível enviar arquivos de imagem.");
      return;
    }
    if (arquivo.size > MAX_FOTO_BYTES) {
      setErroFoto(`Essa imagem tem ${(arquivo.size / 1024 / 1024).toFixed(1)}MB — o máximo é 6MB.`);
      return;
    }
    setArquivoFoto(arquivo);
    // Sincroniza com o <input type="file"> de verdade, pra viajar junto no
    // FormData quando o form é submetido nativamente (arrastar/colar não
    // passa pelo input, só clicar/selecionar passa).
    if (inputFotoRef.current) {
      const dt = new DataTransfer();
      dt.items.add(arquivo);
      inputFotoRef.current.files = dt.files;
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo produto{categoriaInicial ? ` — ${categoriaInicial}` : ""}</DialogTitle>
        </DialogHeader>
        <form
          action={formAction}
          className="space-y-4"
          onPaste={(e) => {
            const arquivo = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
            if (arquivo) {
              e.preventDefault();
              selecionarFoto(arquivo);
            }
          }}
        >
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
            <Label>Foto</Label>
            <div
              className={cn(
                "space-y-2 rounded-lg border-2 border-dashed p-3 transition-colors",
                arrastandoFoto ? "border-primary bg-primary/5" : "border-transparent",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                if (e.dataTransfer.types.includes("Files")) setArrastandoFoto(true);
              }}
              onDragLeave={() => setArrastandoFoto(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastandoFoto(false);
                const arquivo = e.dataTransfer.files?.[0];
                if (arquivo) selecionarFoto(arquivo);
              }}
            >
              {previewFoto && (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewFoto} alt="Prévia" className="h-32 w-32 rounded-lg border object-contain bg-muted/30" />
                </div>
              )}
              <div className="flex items-center justify-center gap-2">
                <input
                  ref={inputFotoRef}
                  type="file"
                  name="foto"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const arquivo = e.target.files?.[0];
                    if (arquivo) selecionarFoto(arquivo);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  title="Também aceita arrastar e soltar, ou colar (Ctrl+V)"
                  onClick={() => inputFotoRef.current?.click()}
                >
                  <Upload className="size-3.5" />
                  {arquivoFoto ? "Trocar foto" : "Escolher foto"}
                </Button>
                {arquivoFoto && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setArquivoFoto(null);
                      if (inputFotoRef.current) inputFotoRef.current.value = "";
                    }}
                  >
                    <X className="size-3.5" />
                    Remover
                  </Button>
                )}
              </div>
              <p className="text-center text-[11px] text-muted-foreground">
                {arrastandoFoto ? "Solte a imagem aqui" : "ou arraste uma imagem, ou cole com Ctrl+V"}
              </p>
            </div>
            {erroFoto && <p className="text-center text-xs text-destructive">{erroFoto}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="imagem-produto">Ou URL da imagem</Label>
            <Input id="imagem-produto" name="imagemUrl" placeholder="https://..." disabled={!!arquivoFoto} />
          </div>

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
