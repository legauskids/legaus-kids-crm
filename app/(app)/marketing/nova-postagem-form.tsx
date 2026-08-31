"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, Loader2 } from "lucide-react";
import { criarPostagemAction, type PostagemFormState } from "@/app/(app)/marketing/actions";
import { TIPO_POSTAGEM_LABEL } from "@/app/(app)/marketing/types";

const initialState: PostagemFormState = {};

export function NovaPostagemForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(criarPostagemAction, initialState);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      router.push("/marketing?aba=postagens");
    }
  }, [state.success, router]);

  return (
    <div className="flex-1 p-6">
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Enviar foto pra virar postagem</CardTitle>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={formAction} className="space-y-4">
            <label
              htmlFor="imagem"
              className="flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/40 hover:border-primary/50"
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Prévia" className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImagePlus className="size-8" />
                  <span className="text-sm">Clique pra escolher uma foto</span>
                </div>
              )}
            </label>
            <input
              ref={inputRef}
              id="imagem"
              name="imagem"
              type="file"
              accept="image/*"
              required
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return setPreview(null);
                setPreview(URL.createObjectURL(file));
              }}
            />

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

            <Button type="submit" className="w-full" disabled={pending}>
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
