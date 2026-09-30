"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCategoriasTarefa } from "@/components/tarefas/categorias-context";
import { SEM_CATEGORIA } from "@/lib/utils/categoria-tarefa";

/**
 * Categoria de compromisso + os campos que dependem dela, usados em todo
 * formulário de tarefa (Tarefas, negócio, Atendimento, criar e editar):
 * - "Postagem no Feed" (campo extra LINK) mostra "Link da postagem";
 * - "Reunião de Equipe" (campo extra PAUTA) troca a descrição por "Pauta / anotações".
 * Os nomes dos campos (categoriaId, link, descricao) são lidos no servidor por
 * categoriaDoFormulario (lib/utils/categoria-tarefa.ts).
 */
export function CamposCategoriaTarefa({
  idPrefixo,
  categoriaIdInicial,
  linkInicial,
  descricaoInicial,
  placeholderDescricao = "O que precisa ser feito (ou aprovado)?",
}: {
  idPrefixo: string;
  categoriaIdInicial?: string | null;
  linkInicial?: string | null;
  descricaoInicial?: string | null;
  placeholderDescricao?: string;
}) {
  const todas = useCategoriasTarefa();
  const [categoriaId, setCategoriaId] = useState(categoriaIdInicial ?? SEM_CATEGORIA);
  // Só as ativas aparecem pra escolher — mais a atual, se foi desativada depois.
  const opcoes = todas.filter((c) => c.ativa || c.id === categoriaIdInicial);
  const selecionada = todas.find((c) => c.id === categoriaId) ?? null;

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefixo}-categoria`}>Categoria de compromisso (opcional)</Label>
        <Select name="categoriaId" value={categoriaId} onValueChange={setCategoriaId}>
          <SelectTrigger id={`${idPrefixo}-categoria`} className="w-full">
            <SelectValue placeholder="Sem categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_CATEGORIA}>Sem categoria</SelectItem>
            {opcoes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ backgroundColor: c.cor }} />
                  {c.nome}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selecionada?.campoExtra === "LINK" && (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefixo}-link`}>Link da postagem (opcional)</Label>
          <Input id={`${idPrefixo}-link`} name="link" defaultValue={linkInicial ?? ""} placeholder="https://www.instagram.com/p/..." inputMode="url" />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={`${idPrefixo}-descricao`}>{selecionada?.campoExtra === "PAUTA" ? "Pauta / anotações" : "Descrição"}</Label>
        <Textarea
          id={`${idPrefixo}-descricao`}
          name="descricao"
          defaultValue={descricaoInicial ?? ""}
          placeholder={selecionada?.campoExtra === "PAUTA" ? "Assuntos tratados, decisões, próximos passos..." : placeholderDescricao}
          rows={selecionada?.campoExtra === "PAUTA" ? 5 : 3}
        />
      </div>
    </>
  );
}
