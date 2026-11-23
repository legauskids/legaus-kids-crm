"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Paperclip, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { centavosParaReais } from "@/lib/utils/money";
import { centavosParaTexto, centroDoSeletor, seletorDoCentro, textoParaCentavos } from "@/lib/utils/despesas";
import { MAX_PARCELAS, TAMANHO_MAXIMO_ANEXO_CONTA, mimeAnexoConta, rotuloParcela, type ContaPagarVM, type RepeticaoConta } from "@/lib/utils/contas-pagar";
import { reduzirImagem } from "@/lib/utils/reduzir-imagem";
import { atualizarContaPagarAction, criarContaPagarAction } from "@/app/(app)/financeiro/contas-pagar-actions";
import { SeletorCentroDespesa, type CategoriaVM, type CentroGeralVM, type ProjetoDespesaVM } from "@/app/(app)/financeiro/despesa-dialog";

const REPETICOES: { valor: RepeticaoConta; label: string }[] = [
  { valor: "UNICA", label: "Só esta" },
  { valor: "MENSAL", label: "Todo mês (conta fixa)" },
  { valor: "PARCELADA", label: "Parcelada" },
];

/** Foto grande é reduzida no aparelho (a Vercel recusa envio acima de ~4,5 MB). */
async function prepararArquivo(arquivo: File): Promise<File> {
  if (!arquivo.type.startsWith("image/") || arquivo.size <= 1024 * 1024) return arquivo;
  const reduzida = await reduzirImagem(arquivo);
  if (reduzida === arquivo) return arquivo;
  return new File([reduzida], arquivo.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

/** Nova conta a pagar (sem `conta`) ou edição de uma ainda não paga. Pedido de 2026-11-23. */
export function ContaPagarDialog({
  open,
  onOpenChange,
  conta,
  categorias,
  centrosGerais,
  projetos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conta?: ContaPagarVM;
  categorias: CategoriaVM[];
  centrosGerais: CentroGeralVM[];
  projetos: ProjetoDespesaVM[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [valorTexto, setValorTexto] = useState(conta && conta.valorCentavos > 0 ? centavosParaTexto(conta.valorCentavos) : "");
  const [vencimento, setVencimento] = useState(conta?.vencimento ?? "");
  const [fornecedor, setFornecedor] = useState(conta?.fornecedor ?? "");
  const [categoriaId, setCategoriaId] = useState(conta?.categoriaId ?? "");
  const [centro, setCentro] = useState(conta ? seletorDoCentro(conta) : "");
  const [descricao, setDescricao] = useState(conta?.descricao ?? "");
  const [codigo, setCodigo] = useState(conta?.codigoPagamento ?? "");
  const [repeticao, setRepeticao] = useState<RepeticaoConta>("UNICA");
  const [parcelasTexto, setParcelasTexto] = useState("2");
  const [repeteTodoMes, setRepeteTodoMes] = useState(conta?.repeteTodoMes ?? false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [removerAnexo, setRemoverAnexo] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const parcela = conta ? rotuloParcela(conta.parcela, conta.totalParcelas) : null;
  const parcelada = !conta && repeticao === "PARCELADA";
  const parcelas = Number(parcelasTexto);
  const valorCentavos = textoParaCentavos(valorTexto);

  // Projeto antigo (fora dos 200 mais recentes) continua aparecendo no seletor.
  const projetosComAtual =
    conta?.negocioId && !projetos.some((p) => p.id === conta.negocioId)
      ? [{ id: conta.negocioId, titulo: conta.negocioTitulo ?? "Projeto", contatoNome: conta.contatoNome }, ...projetos]
      : projetos;

  function escolherCategoria(id: string) {
    setCategoriaId(id);
    const padrao = categorias.find((c) => c.id === id)?.centroGeralPadraoId;
    if (!centro && padrao) setCentro(`g:${padrao}`);
  }

  async function escolherArquivo(escolhido: File | undefined) {
    setErro(null);
    if (!escolhido) return;
    if (!mimeAnexoConta(escolhido.type, escolhido.name)) {
      setErro("Escolha uma foto ou um PDF do boleto/fatura.");
      return;
    }
    const pronto = await prepararArquivo(escolhido);
    if (pronto.size > TAMANHO_MAXIMO_ANEXO_CONTA) {
      setErro("Arquivo grande demais — o máximo é 4 MB.");
      return;
    }
    setArquivo(pronto);
    setRemoverAnexo(false);
  }

  function salvar() {
    setErro(null);
    if (Number.isNaN(valorCentavos) || valorCentavos <= 0) {
      setErro("Valor inválido — use por exemplo 96 ou 1.234,56.");
      return;
    }
    if (!vencimento) {
      setErro("Informe o vencimento.");
      return;
    }
    if (parcelada && (!Number.isInteger(parcelas) || parcelas < 2 || parcelas > MAX_PARCELAS)) {
      setErro(`Número de parcelas: de 2 a ${MAX_PARCELAS}.`);
      return;
    }
    const dados = {
      vencimento,
      valorCentavos,
      fornecedor,
      descricao,
      categoriaId: categoriaId || null,
      ...centroDoSeletor(centro),
      codigoPagamento: codigo,
      ...(conta ? { repeteTodoMes: conta.parcela ? undefined : repeteTodoMes, removerAnexo } : { repeticao, parcelas: parcelada ? parcelas : undefined }),
    };
    const form = new FormData();
    form.append("dados", JSON.stringify(dados));
    if (arquivo) form.append("anexo", arquivo, arquivo.name);
    startTransition(async () => {
      const r = await (conta ? atualizarContaPagarAction(conta.id, form) : criarContaPagarAction(form)).catch(() => ({
        error: "Não foi possível salvar agora — confira a internet e tente de novo.",
        quantidade: undefined,
      }));
      if (r.error) {
        setErro(r.error);
        return;
      }
      toast.success(conta ? "Conta atualizada." : parcelada ? `${parcelas} parcelas registradas.` : "Conta registrada.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] grid-cols-1 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {!conta ? "Nova conta a pagar" : conta.status === "A_CONFIRMAR" ? "Conferir conta do WhatsApp/Telegram" : parcela ? `Editar parcela ${parcela}` : "Editar conta a pagar"}
          </DialogTitle>
          <DialogDescription>Boleto, fatura, conta fixa ou parcela. Quando for paga, vira despesa e segue para a conciliação.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3">
          {!conta && (
            <div className="grid gap-1 text-xs font-medium text-muted-foreground">
              Repete?
              <div className="flex flex-wrap gap-1">
                {REPETICOES.map((r) => (
                  <button
                    key={r.valor}
                    type="button"
                    onClick={() => setRepeticao(r.valor)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                      repeticao === r.valor ? "border-primary bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={cn("grid gap-3", parcelada ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2")}>
            <label className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
              {parcelada ? "Valor da parcela (R$)" : "Valor (R$)"}
              <Input value={valorTexto} onChange={(e) => setValorTexto(e.target.value)} inputMode="decimal" placeholder="0,00" autoFocus />
            </label>
            <label className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
              {parcelada ? "1º vencimento" : "Vencimento"}
              <Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </label>
            {parcelada && (
              <label className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
                Parcelas
                <Input type="number" min={2} max={MAX_PARCELAS} value={parcelasTexto} onChange={(e) => setParcelasTexto(e.target.value)} />
              </label>
            )}
          </div>
          {parcelada && Number.isInteger(parcelas) && parcelas >= 2 && valorCentavos > 0 && (
            <p className="-mt-1 text-xs text-muted-foreground">
              {parcelas}× de {centavosParaReais(valorCentavos)} = {centavosParaReais(valorCentavos * parcelas)}, uma por mês no mesmo dia.
            </p>
          )}
          {!conta && repeticao === "MENSAL" && (
            <p className="-mt-1 text-xs text-muted-foreground">O mês seguinte nasce sozinho, copiando o último mês. Se o valor mudar, é só corrigir o mês.</p>
          )}

          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Fornecedor
            <Input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} placeholder="Ex.: RGE, Unimed, Banco do Brasil" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Categoria
            <select value={categoriaId} onChange={(e) => escolherCategoria(e.target.value)} className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground">
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
            <SeletorCentroDespesa valor={centro} onChange={setCentro} centrosGerais={centrosGerais} projetos={projetosComAtual} className="w-full min-w-0 text-foreground" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Observação (opcional)
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: fatura do cartão, aluguel do pavilhão" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Código para pagar (opcional)
            <Textarea
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Linha digitável, código de barras ou Pix copia e cola"
              className="min-h-14 font-mono text-xs"
            />
          </label>

          <div className="grid gap-1 text-xs font-medium text-muted-foreground">
            Boleto ou fatura (foto ou PDF, opcional)
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => arquivoRef.current?.click()} disabled={pending}>
                <Paperclip className="size-3.5" />
                {arquivo || (conta?.temAnexo && !removerAnexo) ? "Trocar arquivo" : "Escolher arquivo"}
              </Button>
              {arquivo ? (
                <span className="flex min-w-0 items-center gap-1 text-foreground">
                  <span className="min-w-0 break-words">{arquivo.name}</span>
                  <button type="button" onClick={() => setArquivo(null)} aria-label="Tirar o arquivo" className="rounded p-0.5 hover:bg-accent">
                    <X className="size-3.5" />
                  </button>
                </span>
              ) : (
                conta?.temAnexo &&
                (removerAnexo ? (
                  <span>
                    O arquivo será tirado.{" "}
                    <button type="button" className="text-primary hover:underline" onClick={() => setRemoverAnexo(false)}>
                      Manter
                    </button>
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <a href={`/api/contas-pagar/${conta.id}/anexo`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      Ver arquivo atual
                    </a>
                    <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setRemoverAnexo(true)}>
                      Tirar
                    </button>
                  </span>
                ))
              )}
            </div>
            {parcelada && <span className="font-normal">O arquivo e o código ficam na 1ª parcela.</span>}
            <input
              ref={arquivoRef}
              type="file"
              accept="application/pdf,image/*,.heic"
              hidden
              onChange={(e) => {
                const escolhido = e.target.files?.[0];
                e.target.value = "";
                void escolherArquivo(escolhido);
              }}
            />
          </div>

          {conta && !conta.parcela && !conta.totalParcelas && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={repeteTodoMes} onChange={(e) => setRepeteTodoMes(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
              <span>
                Repete todo mês (conta fixa)
                {conta.repeteTodoMes && !repeteTodoMes && (
                  <span className="block text-xs text-muted-foreground">Os meses seguintes que ainda estão em aberto saem da lista.</span>
                )}
              </span>
            </label>
          )}
        </div>
        {erro && <p className="text-sm text-destructive">{erro}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Salvando..." : conta ? "Salvar" : parcelada ? "Registrar parcelas" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
