"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { centavosParaReais } from "@/lib/utils/money";
import { Plus, Save } from "lucide-react";
import { criarCentroCustoAction, atualizarCentroCustoAction } from "@/app/(app)/financeiro/actions";

export type CentroCustoEdicaoVM = {
  id: string;
  nome: string;
  tipo: "DESPESA" | "RECEITA";
  palavrasChave: string[];
  ativo: boolean;
  /** Total atribuído a este centro em todos os lançamentos (pra dar noção de uso). */
  totalRateadoCentavos: number;
};

function paraLista(texto: string): string[] {
  return texto.split(",").map((p) => p.trim()).filter(Boolean);
}

/**
 * Centros de custo padrão pras despesas/receitas que não são de um projeto.
 * As palavras-chave (separadas por vírgula) fazem a conciliação SUGERIR o
 * centro quando aparecem na descrição do lançamento — ex. "TARIFA, IOF".
 */
export function CentrosCustoTab({ centros }: { centros: CentroCustoEdicaoVM[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState<"DESPESA" | "RECEITA">("DESPESA");
  const [novasPalavras, setNovasPalavras] = useState("");

  function criar() {
    startTransition(async () => {
      const r = await criarCentroCustoAction(novoNome, novoTipo, paraLista(novasPalavras));
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setNovoNome("");
      setNovasPalavras("");
      toast.success("Centro de custo criado.");
      router.refresh();
    });
  }

  return (
    <div className="flex-1 space-y-5 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Novo centro de custo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome (ex.: Uniformes)" className="h-9 w-56" />
          <select
            value={novoTipo}
            onChange={(e) => setNovoTipo(e.target.value as "DESPESA" | "RECEITA")}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="DESPESA">Despesa</option>
            <option value="RECEITA">Receita</option>
          </select>
          <Input
            value={novasPalavras}
            onChange={(e) => setNovasPalavras(e.target.value)}
            placeholder="Palavras-chave da sugestão, separadas por vírgula (opcional)"
            className="h-9 min-w-64 flex-1"
          />
          <Button size="sm" onClick={criar} disabled={pending || !novoNome.trim()}>
            <Plus className="size-3.5" />
            Criar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Centros de custo</CardTitle>
          <p className="text-xs text-muted-foreground">
            Projetos (negócios) já funcionam como centro de custo próprio — estes são para o resto: folha, impostos, tarifas, marketing etc.
            As palavras-chave só geram sugestão na conciliação; ninguém é classificado sem confirmação.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {centros.map((c) => (
            <LinhaCentro key={`${c.id}-${c.nome}-${c.palavrasChave.join(",")}-${c.ativo}-${c.tipo}`} centro={c} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function LinhaCentro({ centro }: { centro: CentroCustoEdicaoVM }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nome, setNome] = useState(centro.nome);
  const [tipo, setTipo] = useState(centro.tipo);
  const [palavras, setPalavras] = useState(centro.palavrasChave.join(", "));
  const alterado = nome !== centro.nome || tipo !== centro.tipo || palavras !== centro.palavrasChave.join(", ");

  function salvar(dados: Parameters<typeof atualizarCentroCustoAction>[1]) {
    startTransition(async () => {
      const r = await atualizarCentroCustoAction(centro.id, dados);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-lg border p-2", !centro.ativo && "opacity-60")}>
      <Input value={nome} onChange={(e) => setNome(e.target.value)} className="h-8 w-56 text-sm" />
      <select
        value={tipo}
        onChange={(e) => setTipo(e.target.value as "DESPESA" | "RECEITA")}
        className="h-8 rounded-md border bg-background px-2 text-xs"
      >
        <option value="DESPESA">Despesa</option>
        <option value="RECEITA">Receita</option>
      </select>
      <Input
        value={palavras}
        onChange={(e) => setPalavras(e.target.value)}
        placeholder="Palavras-chave (vírgula)"
        className="h-8 min-w-56 flex-1 text-xs"
      />
      <span className="w-28 text-right text-xs tabular-nums text-muted-foreground" title="Total já atribuído a este centro">
        {centavosParaReais(centro.totalRateadoCentavos)}
      </span>
      {alterado && (
        <Button size="sm" disabled={pending} onClick={() => salvar({ nome, tipo, palavrasChave: paraLista(palavras) })}>
          <Save className="size-3.5" />
          Salvar
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => salvar({ ativo: !centro.ativo })}>
        {centro.ativo ? "Desativar" : "Reativar"}
      </Button>
    </div>
  );
}
