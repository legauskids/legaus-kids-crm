"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { centavosParaTexto, centroDoSeletor, seletorDoCentro, textoParaCentavos } from "@/lib/utils/despesas";
import { atualizarDespesaAction, criarDespesaAction } from "@/app/(app)/financeiro/actions";

export type CategoriaVM = { id: string; nome: string; centroGeralPadraoId: string | null };
export type CentroGeralVM = { id: string; nome: string };
export type ProjetoDespesaVM = { id: string; titulo: string; contatoNome: string | null };

export type DespesaEdicaoVM = {
  id: string;
  dia: string;
  valorCentavos: number;
  fornecedor: string;
  descricao: string | null;
  categoriaId: string | null;
  centroGeralId: string | null;
  negocioId: string | null;
  negocioTitulo: string | null;
  textoOriginal: string | null;
};

/**
 * Centro de custo da despesa: um centro geral (Veículos, Produção...) OU um
 * projeto (negócio). Valor "g:<id>" / "n:<id>" — ver centroDoSeletor.
 */
export function SeletorCentroDespesa({
  valor,
  onChange,
  centrosGerais,
  projetos,
  className,
}: {
  valor: string;
  onChange: (valor: string) => void;
  centrosGerais: CentroGeralVM[];
  projetos: ProjetoDespesaVM[];
  className?: string;
}) {
  return (
    <select value={valor} onChange={(e) => onChange(e.target.value)} className={cn("h-9 rounded-md border bg-background px-2 text-sm", className)}>
      <option value="">Escolha...</option>
      <optgroup label="Centros gerais">
        {centrosGerais.map((c) => (
          <option key={c.id} value={`g:${c.id}`}>
            {c.nome}
          </option>
        ))}
      </optgroup>
      <optgroup label="Projetos (negócios)">
        {projetos.map((p) => (
          <option key={p.id} value={`n:${p.id}`}>
            {p.titulo}
            {p.contatoNome ? ` — ${p.contatoNome}` : ""}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

/** Lançamento manual de despesa (sem `despesa`) ou edição de uma ainda não conciliada. */
export function DespesaDialog({
  open,
  onOpenChange,
  despesa,
  hoje,
  categorias,
  centrosGerais,
  projetos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  despesa?: DespesaEdicaoVM;
  hoje: string;
  categorias: CategoriaVM[];
  centrosGerais: CentroGeralVM[];
  projetos: ProjetoDespesaVM[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [valorTexto, setValorTexto] = useState(despesa ? centavosParaTexto(despesa.valorCentavos) : "");
  const [dia, setDia] = useState(despesa?.dia ?? hoje);
  const [fornecedor, setFornecedor] = useState(despesa?.fornecedor ?? "");
  const [categoriaId, setCategoriaId] = useState(despesa?.categoriaId ?? "");
  const [centro, setCentro] = useState(despesa ? seletorDoCentro(despesa) : "");
  const [descricao, setDescricao] = useState(despesa?.descricao ?? "");

  // Projeto antigo (fora dos 200 mais recentes) continua aparecendo no seletor.
  const projetosComAtual =
    despesa?.negocioId && !projetos.some((p) => p.id === despesa.negocioId)
      ? [{ id: despesa.negocioId, titulo: despesa.negocioTitulo ?? "Projeto", contatoNome: null }, ...projetos]
      : projetos;

  function escolherCategoria(id: string) {
    setCategoriaId(id);
    const padrao = categorias.find((c) => c.id === id)?.centroGeralPadraoId;
    if (!centro && padrao) setCentro(`g:${padrao}`);
  }

  function salvar() {
    setErro(null);
    const valorCentavos = textoParaCentavos(valorTexto);
    if (Number.isNaN(valorCentavos) || valorCentavos <= 0) {
      setErro("Valor inválido — use por exemplo 96 ou 1.234,56.");
      return;
    }
    const dados = { dia, valorCentavos, fornecedor, descricao, categoriaId: categoriaId || null, ...centroDoSeletor(centro) };
    startTransition(async () => {
      const resultado = despesa ? await atualizarDespesaAction(despesa.id, dados) : await criarDespesaAction(dados);
      if (resultado.error) {
        setErro(resultado.error);
        return;
      }
      toast.success(despesa ? "Despesa atualizada." : "Despesa registrada — aguardando o extrato.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{despesa ? "Editar despesa" : "Nova despesa"}</DialogTitle>
          <DialogDescription>Fica aguardando conciliação até aparecer no extrato do banco.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Valor (R$)
              <Input value={valorTexto} onChange={(e) => setValorTexto(e.target.value)} inputMode="decimal" placeholder="0,00" autoFocus />
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Data
              <Input type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
            </label>
          </div>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Fornecedor
            <Input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} placeholder="Ex.: Posto Ipiranga" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Categoria
            <select value={categoriaId} onChange={(e) => escolherCategoria(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground">
              <option value="">Escolha...</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Centro de custo
            <SeletorCentroDespesa valor={centro} onChange={setCentro} centrosGerais={centrosGerais} projetos={projetosComAtual} className="text-foreground" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Observação (opcional)
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </label>
          {despesa?.textoOriginal && (
            <div className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
              <span className="font-medium">Mensagem original:</span> {despesa.textoOriginal}
            </div>
          )}
        </div>
        {erro && <p className="text-sm text-destructive">{erro}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Salvando..." : despesa ? "Salvar" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
