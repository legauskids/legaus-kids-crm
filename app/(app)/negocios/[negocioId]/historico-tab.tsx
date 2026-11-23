"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { File as FileIcon, FileArchive, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { adicionarNotaHistoricoAction } from "@/app/(app)/negocios/actions";
import {
  enviarParteArquivoNegocioAction,
  iniciarArquivoNegocioAction,
  registrarArquivosNegocioAction,
} from "@/app/(app)/negocios/[negocioId]/arquivos-actions";
import { AnexarOrcamentoDialog } from "@/app/(app)/negocios/[negocioId]/anexar-orcamento-dialog";
import {
  MAX_ARQUIVOS_POR_ENVIO,
  TAMANHO_MAXIMO_ARQUIVO_NEGOCIO,
  abreNoNavegador,
  enviarEmPartes,
  problemaDoArquivo,
  tamanhoLegivel,
  type ArquivoNegocioVM,
} from "@/lib/utils/negocio-arquivos";

type Atividade = {
  id: string;
  tipo: string;
  texto: string;
  criadoEm: Date;
  autor: { nome: string } | null;
  arquivos: ArquivoNegocioVM[];
  orcamento: { id: string; numero: number } | null;
};

const TIPO_LABEL: Record<string, string> = {
  NOTA: "Nota",
  WHATSAPP: "WhatsApp",
  SISTEMA: "Sistema",
  ARQUIVO: "Arquivo",
  ORCAMENTO: "Orçamento",
};

function IconeDoArquivo({ mime, nome }: { mime: string; nome: string }) {
  const Icone = mime.startsWith("image/")
    ? FileImage
    : mime.startsWith("video/")
      ? FileVideo
      : mime.startsWith("audio/")
        ? FileAudio
        : mime === "application/pdf" || mime.startsWith("text/") || /\.docx?$/i.test(nome)
          ? FileText
          : /\.(xlsx?|csv|ods)$/i.test(nome)
            ? FileSpreadsheet
            : /\.(zip|rar|7z)$/i.test(nome)
              ? FileArchive
              : FileIcon;
  return <Icone className="size-4 shrink-0" />;
}

// Arquivos de qualquer tipo entram no histórico junto com a nota (pedido de
// 2026-11-18): botão, arrastar para o cartão ou colar no campo da nota.
export function HistoricoTab({ negocioId, atividades }: { negocioId: string; atividades: Atividade[] }) {
  const [texto, setTexto] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [pending, startTransition] = useTransition();
  const arquivoRef = useRef<HTMLInputElement>(null);

  function adicionar(novos: File[]) {
    if (novos.length === 0) return;
    const problemas: string[] = [];
    const aceitos = novos.filter((a) => {
      const problema = problemaDoArquivo(a.size);
      if (problema) problemas.push(`"${a.name}" ${problema}.`);
      return !problema;
    });
    const juntos = [...arquivos, ...aceitos];
    if (juntos.length > MAX_ARQUIVOS_POR_ENVIO) problemas.push(`No máximo ${MAX_ARQUIVOS_POR_ENVIO} arquivos por vez.`);
    setArquivos(juntos.slice(0, MAX_ARQUIVOS_POR_ENVIO));
    setAviso(problemas.length > 0 ? problemas.join(" ") : null);
  }

  function salvar() {
    if (arquivos.length === 0) {
      startTransition(async () => {
        await adicionarNotaHistoricoAction(negocioId, texto);
        setTexto("");
      });
      return;
    }
    setAviso(null);
    startTransition(async () => {
      const total = arquivos.reduce((soma, a) => soma + a.size, 0);
      let jaEnviados = 0;
      const ids: string[] = [];
      setProgresso(0);
      for (const arquivo of arquivos) {
        const r = await enviarEmPartes(
          arquivo,
          {
            iniciar: (meta) => iniciarArquivoNegocioAction(negocioId, meta),
            enviarParte: (id, indice, parte) => {
              const form = new FormData();
              form.append("parte", parte);
              return enviarParteArquivoNegocioAction(negocioId, id, indice, form);
            },
          },
          (enviados) => setProgresso(Math.round(((jaEnviados + enviados) / total) * 100)),
        );
        if ("error" in r) {
          setAviso(r.error);
          setProgresso(null);
          return;
        }
        ids.push(r.id);
        jaEnviados += arquivo.size;
      }
      const r = await registrarArquivosNegocioAction(negocioId, ids, texto).catch(() => ({
        error: "Não foi possível registrar agora — confira a internet e tente de novo.",
      }));
      setProgresso(null);
      if ("error" in r) {
        setAviso(r.error);
        return;
      }
      setArquivos([]);
      setTexto("");
    });
  }

  const podeSalvar = !pending && (texto.trim() !== "" || arquivos.length > 0);

  return (
    <div className="mt-4 space-y-4">
      <Card
        className={cn(arrastando && "border-primary bg-primary/5")}
        onDragOver={(e) => {
          if (pending || !e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastando(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          if (!pending) adicionar(Array.from(e.dataTransfer.files));
        }}
      >
        <CardContent className="space-y-3 pt-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (podeSalvar) salvar();
            }}
            className="space-y-2"
          >
            <Textarea
              placeholder="O que foi feito e qual o próximo passo?"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onPaste={(e) => {
                if (pending || e.clipboardData.files.length === 0) return;
                e.preventDefault();
                adicionar(Array.from(e.clipboardData.files));
              }}
            />
            {arquivos.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {arquivos.map((a, i) => (
                  <li key={`${a.name}-${a.size}-${i}`} className="flex min-w-0 max-w-full items-center gap-1.5 rounded-md border bg-muted/30 py-1 pl-2 pr-1 text-xs">
                    <IconeDoArquivo mime={a.type} nome={a.name} />
                    <span className="min-w-0 break-words">{a.name}</span>
                    <span className="shrink-0 text-muted-foreground">{tamanhoLegivel(a.size)}</span>
                    <button
                      type="button"
                      onClick={() => setArquivos(arquivos.filter((_, j) => j !== i))}
                      disabled={pending}
                      aria-label={`Tirar ${a.name}`}
                      className="shrink-0 rounded p-0.5 hover:bg-accent disabled:opacity-50"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {aviso && <p className="text-sm text-destructive">{aviso}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={!podeSalvar}>
                {pending ? (progresso !== null ? `Enviando ${progresso}%...` : "Salvando...") : arquivos.length > 0 ? "Salvar no histórico" : "Adicionar nota"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => arquivoRef.current?.click()} disabled={pending}>
                <Paperclip className="size-4" />
                Anexar arquivos
              </Button>
              <input
                ref={arquivoRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  const escolhidos = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  adicionar(escolhidos);
                }}
              />
              <AnexarOrcamentoDialog negocioId={negocioId} disabled={pending} />
              {arquivos.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  Qualquer tipo, até {TAMANHO_MAXIMO_ARQUIVO_NEGOCIO / (1024 * 1024)} MB cada. Pode arrastar para cá.
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <ul className="space-y-3">
        {atividades.map((atividade) => (
          <li key={atividade.id} className="flex gap-3 border-l-2 pl-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{TIPO_LABEL[atividade.tipo] ?? atividade.tipo}</Badge>
                <span className="text-xs text-muted-foreground">
                  {atividade.autor ? `${atividade.autor.nome} · ` : ""}
                  {atividade.criadoEm.toLocaleString("pt-BR")}
                </span>
              </div>
              {atividade.texto && <p className="mt-1 text-sm">{atividade.texto}</p>}
              {atividade.orcamento && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <Link href={`/orcamentos/${atividade.orcamento.id}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                    <FileText className="size-4 shrink-0" />
                    Abrir orçamento nº {String(atividade.orcamento.numero).padStart(4, "0")}
                  </Link>
                  <a
                    href={`/api/pdf/orcamento/${atividade.orcamento.id}?ver=1`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    Ver PDF
                  </a>
                </div>
              )}
              {atividade.arquivos.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {atividade.arquivos.map((a) => (
                    <li key={a.id} className="flex min-w-0 items-center gap-2 text-sm">
                      <a
                        href={`/api/negocios/arquivo/${a.id}`}
                        {...(abreNoNavegador(a.mime) ? { target: "_blank", rel: "noreferrer" } : { download: a.nome })}
                        className="flex min-w-0 items-center gap-1.5 text-primary hover:underline"
                      >
                        <IconeDoArquivo mime={a.mime} nome={a.nome} />
                        <span className="min-w-0 break-words">{a.nome}</span>
                      </a>
                      <span className="shrink-0 text-xs text-muted-foreground">{tamanhoLegivel(a.tamanho)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
