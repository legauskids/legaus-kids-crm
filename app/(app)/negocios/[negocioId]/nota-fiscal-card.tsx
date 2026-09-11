"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { centavosParaReais, reaisParaCentavos } from "@/lib/utils/money";
import { FileText, FileCode, RefreshCw, AlertTriangle } from "lucide-react";
import {
  criarNotaFiscalAction,
  atualizarStatusNotaFiscalAction,
  tentarEmitirNotaFiscalAction,
  type AcaoNotaFiscalState,
} from "@/app/(app)/negocios/actions";

type StatusNotaFiscal = "NAO_EMITIDA" | "PROCESSANDO" | "AUTORIZADA" | "REJEITADA" | "CANCELADA";

const STATUS_LABEL: Record<StatusNotaFiscal, string> = {
  NAO_EMITIDA: "Não emitida",
  PROCESSANDO: "Processando",
  AUTORIZADA: "Autorizada",
  REJEITADA: "Rejeitada",
  CANCELADA: "Cancelada",
};

const STATUS_COR: Record<StatusNotaFiscal, string> = {
  NAO_EMITIDA: "text-muted-foreground",
  PROCESSANDO: "text-amber-600",
  AUTORIZADA: "text-success",
  REJEITADA: "text-destructive",
  CANCELADA: "text-muted-foreground",
};

export type NotaFiscalVM = {
  id: string;
  status: StatusNotaFiscal;
  numero: string | null;
  motivoRejeicao: string | null;
  valorTotalCentavos: number;
  criadaEm: string;
  temXml: boolean;
  temDanfe: boolean;
};

type ItemForm = {
  nome: string;
  descricao: string;
  quantidade: number;
  valorUnitarioCentavos: number;
  ncm: string;
  cfop: string;
  unidade: string;
  icmsSituacaoTributaria: string;
};

export function NotaFiscalCard({
  negocioId,
  notasFiscais,
  itemPadrao,
  focusNfeConfigurado,
}: {
  negocioId: string;
  notasFiscais: NotaFiscalVM[];
  itemPadrao: ItemForm;
  focusNfeConfigurado: boolean;
}) {
  const router = useRouter();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [item, setItem] = useState<ItemForm>(itemPadrao);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [erroLinha, setErroLinha] = useState<{ notaFiscalId: string; mensagem: string } | null>(null);

  function atualizarCampo<K extends keyof ItemForm>(campo: K, valor: ItemForm[K]) {
    setItem((atual) => ({ ...atual, [campo]: valor }));
  }

  function emitir() {
    setErro(null);
    startTransition(async () => {
      const resultado: AcaoNotaFiscalState = await criarNotaFiscalAction(negocioId, [item]);
      if (resultado.error) {
        setErro(resultado.error);
        return;
      }
      setDialogAberto(false);
      router.refresh();
    });
  }

  function verificarStatus(notaFiscalId: string) {
    setErroLinha(null);
    startTransition(async () => {
      const resultado = await atualizarStatusNotaFiscalAction(notaFiscalId, negocioId);
      if (resultado.error) {
        setErroLinha({ notaFiscalId, mensagem: resultado.error });
        return;
      }
      router.refresh();
    });
  }

  function tentarEmitirDeNovo(notaFiscalId: string) {
    setErroLinha(null);
    startTransition(async () => {
      const resultado = await tentarEmitirNotaFiscalAction(notaFiscalId, negocioId);
      if (resultado.error) {
        setErroLinha({ notaFiscalId, mensagem: resultado.error });
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card className="mt-4">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold">Nota fiscal</CardTitle>
        <Button size="sm" onClick={() => setDialogAberto(true)}>
          Emitir nota fiscal
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {!focusNfeConfigurado && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Emissão ainda não configurada (falta certificado digital e-CNPJ + conta na Focus NFe). Dá pra deixar a nota pronta
              aqui — quando configurar, use &quot;Tentar emitir&quot; pra mandar de verdade.
            </span>
          </div>
        )}

        {notasFiscais.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma nota fiscal emitida ainda.</p>
        ) : (
          notasFiscais.map((n) => (
            <div key={n.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {n.numero ? `NF-e #${n.numero}` : "Nota fiscal"} · <span className={STATUS_COR[n.status]}>{STATUS_LABEL[n.status]}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {centavosParaReais(n.valorTotalCentavos)} · {new Date(n.criadaEm).toLocaleDateString("pt-BR")}
                </p>
                {n.motivoRejeicao && <p className="text-xs text-destructive">{n.motivoRejeicao}</p>}
                {erroLinha?.notaFiscalId === n.id && <p className="text-xs text-destructive">{erroLinha.mensagem}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {n.temXml && (
                  <a href={`/api/nota-fiscal/${n.id}/xml`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary underline underline-offset-2">
                    <FileCode className="size-3.5" /> XML
                  </a>
                )}
                {n.temDanfe && (
                  <a href={`/api/nota-fiscal/${n.id}/danfe`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary underline underline-offset-2">
                    <FileText className="size-3.5" /> DANFE
                  </a>
                )}
                {n.status === "PROCESSANDO" && (
                  <Button variant="outline" size="sm" disabled={pending} onClick={() => verificarStatus(n.id)}>
                    <RefreshCw className="mr-1 size-3.5" /> Verificar status
                  </Button>
                )}
                {(n.status === "NAO_EMITIDA" || n.status === "REJEITADA") && (
                  <Button variant="outline" size="sm" disabled={pending} onClick={() => tentarEmitirDeNovo(n.id)}>
                    Tentar emitir
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Emitir nota fiscal</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
              Confirme <strong>NCM</strong>, <strong>CFOP</strong> e <strong>CST/CSOSN</strong> com o contador antes da primeira
              emissão real — são códigos fiscais específicos do produto e do regime tributário, não preenchi um valor padrão de
              propósito.
            </div>

            <div className="space-y-2">
              <Label htmlFor="nf-nome">Descrição do item</Label>
              <Input id="nf-nome" value={item.descricao} onChange={(e) => atualizarCampo("descricao", e.target.value)} required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="nf-qtd">Quantidade</Label>
                <Input
                  id="nf-qtd"
                  type="number"
                  min="1"
                  value={item.quantidade}
                  onChange={(e) => atualizarCampo("quantidade", Number(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nf-valor">Valor unitário (R$)</Label>
                <Input
                  id="nf-valor"
                  type="number"
                  min="0"
                  step="0.01"
                  value={(item.valorUnitarioCentavos / 100).toFixed(2)}
                  onChange={(e) => atualizarCampo("valorUnitarioCentavos", reaisParaCentavos(Number(e.target.value) || 0))}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="nf-ncm">NCM</Label>
                <Input id="nf-ncm" placeholder="8 dígitos" value={item.ncm} onChange={(e) => atualizarCampo("ncm", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nf-cfop">CFOP</Label>
                <Input id="nf-cfop" placeholder="ex: 5101" value={item.cfop} onChange={(e) => atualizarCampo("cfop", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nf-cst">CST/CSOSN</Label>
                <Input
                  id="nf-cst"
                  placeholder="ex: 102"
                  value={item.icmsSituacaoTributaria}
                  onChange={(e) => atualizarCampo("icmsSituacaoTributaria", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nf-unidade">Unidade</Label>
              <Input id="nf-unidade" value={item.unidade} onChange={(e) => atualizarCampo("unidade", e.target.value)} required />
            </div>

            <p className="text-sm font-medium">Total: {centavosParaReais(item.quantidade * item.valorUnitarioCentavos)}</p>

            {erro && <p className="text-sm text-destructive">{erro}</p>}
          </div>

          <DialogFooter>
            <Button
              disabled={pending || !item.ncm.trim() || !item.cfop.trim() || !item.icmsSituacaoTributaria.trim()}
              onClick={emitir}
            >
              {pending ? "Enviando..." : focusNfeConfigurado ? "Emitir" : "Salvar (emitir depois)"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
