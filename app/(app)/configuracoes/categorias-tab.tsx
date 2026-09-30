"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import {
  atualizarCategoriaTarefaAction,
  criarCategoriaTarefaAction,
  moverCategoriaTarefaAction,
} from "@/app/(app)/configuracoes/actions";

export type CategoriaConfigVM = {
  id: string;
  nome: string;
  cor: string;
  campoExtra: "NENHUM" | "LINK" | "PAUTA";
  ativa: boolean;
  qtdTarefas: number;
};

const CAMPO_EXTRA: { valor: CategoriaConfigVM["campoExtra"]; rotulo: string }[] = [
  { valor: "NENHUM", rotulo: "Nenhum campo extra" },
  { valor: "LINK", rotulo: "Link (ex.: da postagem)" },
  { valor: "PAUTA", rotulo: "Pauta / anotações" },
];

function SeletorCampoExtra({ valor, onChange, id }: { valor: string; onChange: (v: CategoriaConfigVM["campoExtra"]) => void; id: string }) {
  return (
    <select
      id={id}
      value={valor}
      onChange={(e) => onChange(e.target.value as CategoriaConfigVM["campoExtra"])}
      className="h-9 rounded-md border bg-background px-2 text-sm"
      aria-label="Campo extra da tarefa"
    >
      {CAMPO_EXTRA.map((c) => (
        <option key={c.valor} value={c.valor}>
          {c.rotulo}
        </option>
      ))}
    </select>
  );
}

/**
 * Categorias de compromisso da tarefa (Gerar Receita, Melhoria...). É o que
 * os Compromissos contam. Desativar esconde das opções sem apagar a etiqueta
 * das tarefas que já têm a categoria.
 */
export function CategoriasTab({ categorias }: { categorias: CategoriaConfigVM[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("#0f766e");
  const [campoExtra, setCampoExtra] = useState<CategoriaConfigVM["campoExtra"]>("NENHUM");

  function criar() {
    startTransition(async () => {
      const r = await criarCategoriaTarefaAction(nome, cor, campoExtra);
      if (r.error) return void toast.error(r.error);
      setNome("");
      setCampoExtra("NENHUM");
      toast.success("Categoria criada.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Nova categoria</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} className="h-9 w-11 cursor-pointer rounded-md border bg-background p-1" aria-label="Cor" />
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (ex.: Pós-venda)" className="h-9 w-56" />
          <SeletorCampoExtra id="nova-categoria-extra" valor={campoExtra} onChange={setCampoExtra} />
          <Button size="sm" onClick={criar} disabled={pending || !nome.trim()}>
            <Plus className="size-3.5" />
            Criar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Categorias</CardTitle>
          <p className="text-xs text-muted-foreground">
            A ordem aqui é a das opções no formulário de tarefa. O campo extra aparece na tarefa da categoria: Link pede o link (ex.: da
            postagem) e Pauta troca a descrição por pauta/anotações.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {categorias.map((c, indice) => (
            <LinhaCategoria
              key={`${c.id}-${c.nome}-${c.cor}-${c.campoExtra}-${c.ativa}`}
              categoria={c}
              primeira={indice === 0}
              ultima={indice === categorias.length - 1}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function LinhaCategoria({ categoria, primeira, ultima }: { categoria: CategoriaConfigVM; primeira: boolean; ultima: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nome, setNome] = useState(categoria.nome);
  const [cor, setCor] = useState(categoria.cor);
  const [campoExtra, setCampoExtra] = useState(categoria.campoExtra);
  const alterada = nome !== categoria.nome || cor !== categoria.cor || campoExtra !== categoria.campoExtra;

  function executar(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const r = await fn();
      if (r.error) return void toast.error(r.error);
      router.refresh();
    });
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-lg border p-2", !categoria.ativa && "opacity-60")}>
      <div className="flex flex-col">
        <button
          type="button"
          disabled={pending || primeira}
          onClick={() => executar(() => moverCategoriaTarefaAction(categoria.id, "cima"))}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
          aria-label="Subir"
        >
          <ArrowUp className="size-3.5" />
        </button>
        <button
          type="button"
          disabled={pending || ultima}
          onClick={() => executar(() => moverCategoriaTarefaAction(categoria.id, "baixo"))}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
          aria-label="Descer"
        >
          <ArrowDown className="size-3.5" />
        </button>
      </div>
      <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} className="h-9 w-11 cursor-pointer rounded-md border bg-background p-1" aria-label="Cor" />
      <Input value={nome} onChange={(e) => setNome(e.target.value)} className="h-9 w-56" aria-label="Nome" />
      <SeletorCampoExtra id={`extra-${categoria.id}`} valor={campoExtra} onChange={setCampoExtra} />
      <span className="text-xs text-muted-foreground">{categoria.qtdTarefas} tarefas</span>
      <div className="ml-auto flex gap-2">
        {alterada && (
          <Button size="sm" disabled={pending} onClick={() => executar(() => atualizarCategoriaTarefaAction(categoria.id, { nome, cor, campoExtra }))}>
            Salvar
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => executar(() => atualizarCategoriaTarefaAction(categoria.id, { ativa: !categoria.ativa }))}
        >
          {categoria.ativa ? "Desativar" : "Reativar"}
        </Button>
      </div>
    </div>
  );
}
