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
import {
  criarCentroCustoAction,
  atualizarCentroCustoAction,
  criarCentroGeralAction,
  atualizarCentroGeralAction,
} from "@/app/(app)/financeiro/actions";

export type CentroCustoEdicaoVM = {
  id: string;
  nome: string;
  tipo: "DESPESA" | "RECEITA";
  palavrasChave: string[];
  ativo: boolean;
  centroGeralPadraoId: string | null;
  /** Total atribuído a esta categoria em todos os lançamentos (pra dar noção de uso). */
  totalRateadoCentavos: number;
};

export type CentroGeralEdicaoVM = { id: string; nome: string; ativo: boolean; quantidadeDespesas: number };

function paraLista(texto: string): string[] {
  return texto.split(",").map((p) => p.trim()).filter(Boolean);
}

/**
 * Categorias (natureza do gasto/receita — a tabela CentroCusto) e centros de
 * custo gerais (Veículos, Produção...). As palavras-chave (separadas por
 * vírgula) fazem a conciliação SUGERIR a categoria quando aparecem na
 * descrição do lançamento — ex. "TARIFA, IOF". O centro sugerido entra
 * sozinho quando a categoria é escolhida numa despesa.
 */
export function CentrosCustoTab({ centros, centrosGerais }: { centros: CentroCustoEdicaoVM[]; centrosGerais: CentroGeralEdicaoVM[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState<"DESPESA" | "RECEITA">("DESPESA");
  const [novasPalavras, setNovasPalavras] = useState("");
  const [novoCentroPadrao, setNovoCentroPadrao] = useState("");
  const [novoCentroGeral, setNovoCentroGeral] = useState("");
  const centrosGeraisAtivos = centrosGerais.filter((c) => c.ativo);

  function criar() {
    startTransition(async () => {
      const r = await criarCentroCustoAction(novoNome, novoTipo, paraLista(novasPalavras), novoCentroPadrao || null);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setNovoNome("");
      setNovasPalavras("");
      setNovoCentroPadrao("");
      toast.success("Categoria criada.");
      router.refresh();
    });
  }

  function criarCentroGeral() {
    startTransition(async () => {
      const r = await criarCentroGeralAction(novoCentroGeral);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setNovoCentroGeral("");
      toast.success("Centro de custo criado.");
      router.refresh();
    });
  }

  return (
    <div className="flex-1 space-y-5 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Centros de custo gerais</CardTitle>
          <p className="text-xs text-muted-foreground">
            Onde a despesa é alocada quando não é de um projeto. Projetos (negócios) já funcionam como centro de custo próprio.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {centrosGerais.map((c) => (
            <LinhaCentroGeral key={`${c.id}-${c.nome}-${c.ativo}`} centro={c} />
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Input value={novoCentroGeral} onChange={(e) => setNovoCentroGeral(e.target.value)} placeholder="Novo centro (ex.: Obras)" className="h-8 w-56 text-sm" />
            <Button size="sm" variant="outline" onClick={criarCentroGeral} disabled={pending || !novoCentroGeral.trim()}>
              <Plus className="size-3.5" />
              Criar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Nova categoria</CardTitle>
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
          <SeletorCentroPadrao valor={novoCentroPadrao} onChange={setNovoCentroPadrao} centrosGerais={centrosGeraisAtivos} className="h-9 text-sm" />
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
          <CardTitle className="text-sm font-semibold">Categorias</CardTitle>
          <p className="text-xs text-muted-foreground">
            A natureza do gasto ou da receita: combustível, folha, impostos, tarifas, alimentação etc. O centro ao lado é sugerido quando a
            categoria é escolhida. As palavras-chave só geram sugestão na conciliação; ninguém é classificado sem confirmação.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {centros.map((c) => (
            <LinhaCategoria
              key={`${c.id}-${c.nome}-${c.palavrasChave.join(",")}-${c.ativo}-${c.tipo}-${c.centroGeralPadraoId}`}
              centro={c}
              centrosGerais={centrosGeraisAtivos}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SeletorCentroPadrao({
  valor,
  onChange,
  centrosGerais,
  className,
}: {
  valor: string;
  onChange: (valor: string) => void;
  centrosGerais: { id: string; nome: string }[];
  className?: string;
}) {
  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      title="Centro de custo sugerido para esta categoria"
      className={cn("rounded-md border bg-background px-2", className)}
    >
      <option value="">Sem centro sugerido</option>
      {centrosGerais.map((g) => (
        <option key={g.id} value={g.id}>
          {g.nome}
        </option>
      ))}
    </select>
  );
}

function LinhaCentroGeral({ centro }: { centro: CentroGeralEdicaoVM }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nome, setNome] = useState(centro.nome);

  function salvar(dados: Parameters<typeof atualizarCentroGeralAction>[1]) {
    startTransition(async () => {
      const r = await atualizarCentroGeralAction(centro.id, dados);
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
      <span className="flex-1 text-xs text-muted-foreground">
        {centro.quantidadeDespesas === 1 ? "1 despesa" : `${centro.quantidadeDespesas} despesas`}
      </span>
      {nome !== centro.nome && (
        <Button size="sm" disabled={pending} onClick={() => salvar({ nome })}>
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

function LinhaCategoria({ centro, centrosGerais }: { centro: CentroCustoEdicaoVM; centrosGerais: { id: string; nome: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nome, setNome] = useState(centro.nome);
  const [tipo, setTipo] = useState(centro.tipo);
  const [palavras, setPalavras] = useState(centro.palavrasChave.join(", "));
  const [centroPadrao, setCentroPadrao] = useState(centro.centroGeralPadraoId ?? "");
  const alterado =
    nome !== centro.nome ||
    tipo !== centro.tipo ||
    palavras !== centro.palavrasChave.join(", ") ||
    centroPadrao !== (centro.centroGeralPadraoId ?? "");

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
      <SeletorCentroPadrao valor={centroPadrao} onChange={setCentroPadrao} centrosGerais={centrosGerais} className="h-8 text-xs" />
      <Input
        value={palavras}
        onChange={(e) => setPalavras(e.target.value)}
        placeholder="Palavras-chave (vírgula)"
        className="h-8 min-w-56 flex-1 text-xs"
      />
      <span className="w-28 text-right text-xs tabular-nums text-muted-foreground" title="Total já atribuído a esta categoria">
        {centavosParaReais(centro.totalRateadoCentavos)}
      </span>
      {alterado && (
        <Button
          size="sm"
          disabled={pending}
          onClick={() => salvar({ nome, tipo, palavrasChave: paraLista(palavras), centroGeralPadraoId: centroPadrao || null })}
        >
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
