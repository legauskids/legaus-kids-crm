"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Check,
  FileText,
  Image as ImageIcon,
  MessageCircle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buscarDestinatariosAction,
  enviarProdutoWhatsAppAction,
} from "@/app/(app)/produtos/actions";
import {
  caminhoArquivoProduto,
  textoEnvioProduto,
  type FormatoEnvioProduto,
} from "@/lib/utils/produto-envio";
import { telefoneLegivel, telefonePadraoBR } from "@/lib/utils/telefone";
import type { DestinatarioEnvio } from "@/lib/server/produto-envio";
import type { ProdutoVM } from "@/app/(app)/produtos/produtos-shell";

/**
 * Mandar um produto do catálogo pelo WhatsApp, em card (imagem) ou PDF
 * (ficha do produto) — pedido do Marcos de 2026-10-14.
 */
export function EnviarProdutoDialog({
  produto,
  onOpenChange,
}: {
  produto: ProdutoVM | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [formato, setFormato] = useState<FormatoEnvioProduto>("CARD");
  const [mostrarPreco, setMostrarPreco] = useState(true);
  const [busca, setBusca] = useState("");
  const [destino, setDestino] = useState<DestinatarioEnvio | null>(null);
  const [sugestoes, setSugestoes] = useState<DestinatarioEnvio[]>([]);
  const [mensagem, setMensagem] = useState("");
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  // Sugestões de cliente enquanto digita o nome ou o telefone (a lista
  // visível é filtrada na renderização — ver sugestoesVisiveis).
  useEffect(() => {
    if (destino || busca.trim().length < 2) return;
    let cancelado = false;
    const espera = setTimeout(() => {
      buscarDestinatariosAction(busca)
        .then((lista) => !cancelado && setSugestoes(lista))
        .catch(() => !cancelado && setSugestoes([]));
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [busca, destino]);

  if (!produto) return null;

  const ocultarValor = !mostrarPreco;
  const sugestoesVisiveis = !destino && busca.trim().length >= 2 ? sugestoes : [];
  const telefoneDigitado = telefonePadraoBR(busca);
  const telefoneValido =
    !destino &&
    telefoneDigitado.length >= 12 &&
    /^[\d\s()+.-]+$/.test(busca.trim());
  const podeEnviar = Boolean(destino || telefoneValido) && !pending;
  const arquivo = caminhoArquivoProduto(produto.id, formato, ocultarValor);

  function enviar() {
    if (!produto) return;
    setErro(null);
    setSucesso(null);
    startTransition(async () => {
      const r = await enviarProdutoWhatsAppAction({
        produtoId: produto.id,
        telefone: destino?.telefone ?? busca,
        formato,
        ocultarValor,
        mensagem: mensagem.trim() || undefined,
        nomeContato: destino?.nome,
      });
      if ("error" in r) setErro(r.error);
      else setSucesso(`Entrou na fila do WhatsApp para ${r.para}.`);
    });
  }

  return (
    <Dialog open={Boolean(produto)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="size-4" />
            Enviar pelo WhatsApp
          </DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-sm text-muted-foreground">{produto.nome}</p>

        <div className="space-y-2">
          <Label>Formato</Label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { valor: "CARD", rotulo: "Card (imagem)", Icone: ImageIcon },
                { valor: "PDF", rotulo: "PDF (ficha)", Icone: FileText },
              ] as const
            ).map(({ valor, rotulo, Icone }) => (
              <Button
                key={valor}
                type="button"
                variant={formato === valor ? "default" : "outline"}
                onClick={() => setFormato(valor)}
              >
                <Icone className="size-4" />
                {rotulo}
              </Button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={mostrarPreco}
              onCheckedChange={(v) => setMostrarPreco(v === true)}
            />
            Mostrar o preço
          </label>
        </div>

        <div className="rounded-md border bg-muted/30 p-2">
          {formato === "CARD" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={arquivo}
              src={arquivo}
              alt={`Card de ${produto.nome}`}
              className="mx-auto max-h-64 rounded"
            />
          ) : (
            <a
              href={arquivo}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 py-6 text-sm text-primary hover:underline"
            >
              <FileText className="size-5" />
              Ver o PDF que vai ser enviado
            </a>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="destino-produto">Para</Label>
          {destino ? (
            <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{destino.nome}</span>{" "}
                <span className="text-muted-foreground">
                  — {destino.telefoneFormatado}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDestino(null)}
                aria-label="Trocar destinatário"
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <div className="relative">
              <Input
                id="destino-produto"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome do cliente ou telefone com DDD"
                autoComplete="off"
              />
              {sugestoesVisiveis.length > 0 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
                  {sugestoesVisiveis.map((s) => (
                    <button
                      key={s.contatoId}
                      type="button"
                      className="flex w-full justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => {
                        setDestino(s);
                        setSugestoes([]);
                      }}
                    >
                      <span className="truncate">{s.nome}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {s.telefoneFormatado}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {telefoneValido && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Vai para {telefoneLegivel(telefoneDigitado)}.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="mensagem-produto">Mensagem (opcional)</Label>
          <Textarea
            id="mensagem-produto"
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder={textoEnvioProduto(produto, formato, ocultarValor)}
            rows={2}
          />
        </div>

        {erro && <p className="text-sm text-destructive">{erro}</p>}
        {sucesso && (
          <p className={cn("flex items-center gap-1.5 text-sm text-success")}>
            <Check className="size-4" />
            {sucesso}
          </p>
        )}

        <DialogFooter>
          <Button type="button" onClick={enviar} disabled={!podeEnviar}>
            {pending
              ? "Enviando..."
              : `Enviar ${formato === "PDF" ? "PDF" : "card"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
