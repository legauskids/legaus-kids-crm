"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, Loader2, X } from "lucide-react";
import { criarPostagemAction, type PostagemFormState } from "@/app/(app)/marketing/actions";
import { TIPO_POSTAGEM_LABEL } from "@/app/(app)/marketing/types";

const initialState: PostagemFormState = {};

type ArquivoComPreview = { file: File; preview: string };

export function NovaPostagemForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(criarPostagemAction, initialState);
  const [arquivos, setArquivos] = useState<ArquivoComPreview[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      arquivos.forEach((a) => URL.revokeObjectURL(a.preview));
      router.push("/marketing?aba=postagens");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success, router]);

  function adicionarArquivos(novos: FileList | null) {
    if (!novos || novos.length === 0) return;
    const adicionados = Array.from(novos).map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setArquivos((atual) => [...atual, ...adicionados]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removerArquivo(index: number) {
    setArquivos((atual) => {
      URL.revokeObjectURL(atual[index].preview);
      return atual.filter((_, i) => i !== index);
    });
  }

  function submeter(formData: FormData) {
    formData.delete("imagens");
    arquivos.forEach((a) => formData.append("imagens", a.file));
    formAction(formData);
  }

  return (
    <div className="flex-1 p-6">
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Enviar fotos pra virar postagem</CardTitle>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={submeter} className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {arquivos.map((a, i) => (
                <div key={a.preview} className="group relative aspect-square overflow-hidden rounded-lg border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.preview} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removerArquivo(i)}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                  {arquivos.length > 1 && (
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {i + 1}
                    </span>
                  )}
                </div>
              ))}
              <label
                htmlFor="imagens"
                className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border bg-muted/40 text-muted-foreground hover:border-primary/50"
              >
                <ImagePlus className="size-6" />
                <span className="text-center text-xs leading-tight">
                  {arquivos.length === 0 ? "Escolher fotos" : "Adicionar mais"}
                </span>
              </label>
            </div>
            <input
              ref={inputRef}
              id="imagens"
              name="imagens"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => adicionarArquivos(e.target.files)}
            />
            {arquivos.length > 1 && (
              <p className="text-xs text-muted-foreground">
                {arquivos.length} fotos vão virar um carrossel na mesma postagem, nessa ordem.
              </p>
            )}

            <div className="space-y-2">
              <label htmlFor="tipo" className="text-sm font-medium">
                Onde vai ser postado
              </label>
              <select id="tipo" name="tipo" required defaultValue="" className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                <option value="" disabled>
                  Escolha...
                </option>
                {Object.entries(TIPO_POSTAGEM_LABEL).map(([valor, label]) => (
                  <option key={valor} value={valor}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="headline" className="text-sm font-medium">
                Texto de destaque na imagem (opcional)
              </label>
              <Input id="headline" name="headline" placeholder="ex: Mais um sonho ganhando forma" maxLength={80} />
              <p className="text-xs text-muted-foreground">
                Aparece como uma pílula colorida sobre a foto, no mesmo estilo das postagens da Legaus Kids. Deixe em branco se não quiser texto na imagem.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="contexto" className="text-sm font-medium">
                O que é a foto?
              </label>
              <Textarea
                id="contexto"
                name="contexto"
                rows={3}
                placeholder="ex: instalação de um Kidplay na Escola Francisco de Assis, Santa Rosa"
                required
              />
              <p className="text-xs text-muted-foreground">Isso vira a base da legenda sugerida pela IA — quanto mais contexto, melhor.</p>
            </div>

            {state.error && <p className="text-sm text-destructive">{state.error}</p>}

            <Button type="submit" className="w-full" disabled={pending || arquivos.length === 0}>
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Gerando prévia...
                </>
              ) : (
                "Gerar prévia"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
