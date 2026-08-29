"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { centavosParaReais } from "@/lib/utils/money";
import { AdicionarProdutoDialog, type ProdutoParaEscolha } from "@/app/(app)/orcamentos/adicionar-produto-dialog";
import { salvarOrcamentoAction, criarClienteRapidoAction } from "@/app/(app)/orcamentos/actions";

type ItemEditavel = {
  chave: string;
  produtoId: string | null;
  nome: string;
  descricao: string;
  quantidade: number;
  valorUnitarioReais: number;
  imagemUrl: string | null;
};

export type ContatoParaEscolha = { id: string; nome: string; empresa: string | null; razaoSocial: string | null };

export type OrcamentoParaEditar = {
  id: string;
  contatoId: string | null;
  observacoes: string | null;
  descontoCentavos: number;
  validadeDias: number;
  itens: {
    produtoId: string | null;
    nome: string;
    descricao: string | null;
    quantidade: number;
    valorUnitarioCentavos: number;
    imagemUrl: string | null;
  }[];
};

let contador = 0;
function novaChave() {
  contador += 1;
  return `novo-${contador}`;
}

export function OrcamentoEditor({
  orcamento,
  contatos,
  produtos,
}: {
  orcamento?: OrcamentoParaEditar;
  contatos: ContatoParaEscolha[];
  produtos: ProdutoParaEscolha[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [contatoId, setContatoId] = useState<string>(orcamento?.contatoId ?? "");
  const [listaContatos, setListaContatos] = useState(contatos);
  const [itens, setItens] = useState<ItemEditavel[]>(
    orcamento?.itens.map((i) => ({
      chave: novaChave(),
      produtoId: i.produtoId,
      nome: i.nome,
      descricao: i.descricao ?? "",
      quantidade: i.quantidade,
      valorUnitarioReais: i.valorUnitarioCentavos / 100,
      imagemUrl: i.imagemUrl,
    })) ?? [],
  );
  const [descontoReais, setDescontoReais] = useState(orcamento ? orcamento.descontoCentavos / 100 : 0);
  const [validadeDias, setValidadeDias] = useState(orcamento?.validadeDias ?? 15);
  const [observacoes, setObservacoes] = useState(orcamento?.observacoes ?? "");

  const [produtoDialogAberto, setProdutoDialogAberto] = useState(false);
  const [novoClienteAberto, setNovoClienteAberto] = useState(false);
  const [novoClienteNome, setNovoClienteNome] = useState("");
  const [novoClienteTelefone, setNovoClienteTelefone] = useState("");
  const [criandoCliente, startCriarCliente] = useTransition();

  const subtotal = useMemo(
    () => itens.reduce((soma, item) => soma + item.quantidade * item.valorUnitarioReais, 0),
    [itens],
  );
  const total = Math.max(0, subtotal - descontoReais);

  function adicionarProduto(produto: ProdutoParaEscolha) {
    setItens((atual) => [
      ...atual,
      {
        chave: novaChave(),
        produtoId: produto.id,
        nome: produto.nome,
        descricao: produto.descricao ?? "",
        quantidade: 1,
        valorUnitarioReais: produto.valorCentavos != null ? produto.valorCentavos / 100 : 0,
        imagemUrl: produto.imagemUrl,
      },
    ]);
  }

  function adicionarItemPersonalizado() {
    setItens((atual) => [
      ...atual,
      { chave: novaChave(), produtoId: null, nome: "", descricao: "", quantidade: 1, valorUnitarioReais: 0, imagemUrl: null },
    ]);
  }

  function atualizarItem(chave: string, patch: Partial<ItemEditavel>) {
    setItens((atual) => atual.map((item) => (item.chave === chave ? { ...item, ...patch } : item)));
  }

  function removerItem(chave: string) {
    setItens((atual) => atual.filter((item) => item.chave !== chave));
  }

  function criarClienteRapido() {
    startCriarCliente(async () => {
      const resultado = await criarClienteRapidoAction({ nome: novoClienteNome, telefone: novoClienteTelefone });
      if ("error" in resultado) {
        setErro(resultado.error);
        return;
      }
      setListaContatos((atual) => [...atual, { id: resultado.id, nome: resultado.nome, empresa: null, razaoSocial: null }]);
      setContatoId(resultado.id);
      setNovoClienteAberto(false);
      setNovoClienteNome("");
      setNovoClienteTelefone("");
    });
  }

  function salvar() {
    setErro(null);
    if (itens.length === 0) {
      setErro("Adicione pelo menos um item.");
      return;
    }
    startTransition(async () => {
      const resultado = await salvarOrcamentoAction({
        orcamentoId: orcamento?.id,
        contatoId: contatoId || null,
        observacoes,
        descontoReais,
        validadeDias,
        itens: itens.map((i) => ({
          produtoId: i.produtoId,
          nome: i.nome,
          descricao: i.descricao,
          quantidade: i.quantidade,
          valorUnitarioReais: i.valorUnitarioReais,
        })),
      });
      if ("error" in resultado) {
        setErro(resultado.error);
        return;
      }
      router.push(`/orcamentos/${resultado.id}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Cliente</Label>
          <div className="flex gap-2">
            <Select value={contatoId || "__nenhum__"} onValueChange={(v) => setContatoId(v === "__nenhum__" ? "" : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sem cliente vinculado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__nenhum__">Sem cliente vinculado</SelectItem>
                {listaContatos.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                    {c.razaoSocial ? ` — ${c.razaoSocial}` : c.empresa ? ` — ${c.empresa}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="icon" title="Novo cliente" onClick={() => setNovoClienteAberto(true)}>
              <UserPlus className="size-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="validade">Validade (dias)</Label>
          <Input
            id="validade"
            type="number"
            min="1"
            value={validadeDias}
            onChange={(e) => setValidadeDias(Number(e.target.value) || 1)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Itens</Label>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={adicionarItemPersonalizado}>
              <Plus className="size-3.5" />
              Item personalizado
            </Button>
            <Button type="button" size="sm" onClick={() => setProdutoDialogAberto(true)}>
              <Plus className="size-3.5" />
              Adicionar produto
            </Button>
          </div>
        </div>

        {itens.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum item ainda — adicione um produto do catálogo ou um item personalizado.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="w-20 px-3 py-2 font-medium">Qtd.</th>
                  <th className="w-32 px-3 py-2 font-medium">Valor unit.</th>
                  <th className="w-32 px-3 py-2 font-medium">Subtotal</th>
                  <th className="w-10 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => (
                  <tr key={item.chave} className="border-t align-top">
                    <td className="px-3 py-2">
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/40">
                          {item.imagemUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.imagemUrl} alt="" className="h-full w-full object-contain" />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <Input
                            value={item.nome}
                            onChange={(e) => atualizarItem(item.chave, { nome: e.target.value })}
                            placeholder="Nome do item"
                            className="h-8"
                          />
                          <Textarea
                            value={item.descricao}
                            onChange={(e) => atualizarItem(item.chave, { descricao: e.target.value })}
                            placeholder="Descrição (opcional)"
                            rows={2}
                            className="min-h-0 resize-y text-xs text-muted-foreground"
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min="1"
                        value={item.quantidade}
                        onChange={(e) => atualizarItem(item.chave, { quantidade: Number(e.target.value) || 1 })}
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.valorUnitarioReais}
                        onChange={(e) => atualizarItem(item.chave, { valorUnitarioReais: Number(e.target.value) || 0 })}
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2 pt-4 text-xs font-medium tabular-nums">
                      {centavosParaReais(Math.round(item.quantidade * item.valorUnitarioReais * 100))}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="icon-sm" onClick={() => removerItem(item.chave)}>
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="observacoes">Observações</Label>
          <Textarea
            id="observacoes"
            rows={4}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Condições de pagamento, prazo de entrega, garantia..."
          />
        </div>
        <div className="space-y-2 rounded-lg border p-4">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{centavosParaReais(Math.round(subtotal * 100))}</span>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs">
            <Label htmlFor="desconto" className="text-muted-foreground">
              Desconto (R$)
            </Label>
            <Input
              id="desconto"
              type="number"
              min="0"
              step="0.01"
              value={descontoReais}
              onChange={(e) => setDescontoReais(Number(e.target.value) || 0)}
              className="h-8 w-32 text-xs"
            />
          </div>
          <div className="flex justify-between border-t pt-2 text-sm font-bold">
            <span>Total</span>
            <span className="tabular-nums text-success">{centavosParaReais(Math.round(total * 100))}</span>
          </div>
        </div>
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={pending}>
          {pending ? "Salvando..." : orcamento ? "Salvar alterações" : "Criar orçamento"}
        </Button>
      </div>

      <AdicionarProdutoDialog
        open={produtoDialogAberto}
        onOpenChange={setProdutoDialogAberto}
        produtos={produtos}
        onEscolher={adicionarProduto}
      />

      <Dialog open={novoClienteAberto} onOpenChange={setNovoClienteAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="novo-cliente-nome">Nome</Label>
              <Input id="novo-cliente-nome" value={novoClienteNome} onChange={(e) => setNovoClienteNome(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="novo-cliente-telefone">Telefone</Label>
              <Input id="novo-cliente-telefone" value={novoClienteTelefone} onChange={(e) => setNovoClienteTelefone(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Cadastro rápido — dá pra completar CNPJ e endereço depois em Cadastros → Clientes.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={criarClienteRapido} disabled={criandoCliente || !novoClienteNome.trim()}>
              {criandoCliente ? "Criando..." : "Criar cliente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
