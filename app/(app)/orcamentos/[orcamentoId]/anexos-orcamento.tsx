"use client";

/* eslint-disable @next/next/no-img-element -- miniaturas das imagens anexas, sem otimização do next/image */

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  LEGENDA_MAX,
  MAX_ANEXOS,
  TAMANHOS_RAPIDOS,
  TAMANHO_MAX,
  TAMANHO_MIN,
  paginarAnexos,
  urlAnexo,
  type AnexoOrcamentoVM,
} from "@/lib/utils/anexos-orcamento";
import { reduzirImagem } from "@/lib/utils/reduzir-imagem";
import { FolhaAnexos } from "@/app/(app)/orcamentos/folha-anexos";
import { enviarAnexoOrcamentoAction, excluirAnexoOrcamentoAction, salvarAnexosOrcamentoAction } from "./anexos-actions";

// Imagens anexas ao orçamento (pedido de 2026-11-11): anexar, ver como fica a
// folha e escolher o tamanho de cada uma antes de gerar o PDF. Salva sozinho
// logo depois de cada mudança (separado do "Salvar alterações" do orçamento).

type Estado = "salvo" | "alterado" | "salvando" | "erro";

const TEXTO_ESTADO: Record<Estado, string> = {
  salvo: "Salvo.",
  alterado: "Salvando...",
  salvando: "Salvando...",
  erro: "Não salvou — mude algo pra tentar de novo.",
};

export function AnexosOrcamento({ orcamentoId, numero, anexosIniciais }: { orcamentoId: string; numero: number; anexosIniciais: AnexoOrcamentoVM[] }) {
  const [anexos, setAnexos] = useState(anexosIniciais);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>("salvo");
  const [versao, setVersao] = useState(0);
  const [enviando, setEnviando] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const arquivoRef = useRef<HTMLInputElement>(null);
  const linhasRef = useRef(new Map<string, HTMLLIElement>());
  const anexosRef = useRef(anexos);
  const filaRef = useRef<Promise<unknown>>(Promise.resolve());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimaVersaoRef = useRef(0);

  const folhas = paginarAnexos(anexos);

  function mudar(atualizar: (atuais: AnexoOrcamentoVM[]) => AnexoOrcamentoVM[], salvar = true) {
    const novos = atualizar(anexosRef.current);
    anexosRef.current = novos;
    setAnexos(novos);
    if (!salvar) return;
    setEstado("alterado");
    setVersao((v) => v + 1);
  }

  /** Salva já (em fila, pra não chegar fora de ordem no servidor). */
  function salvarAgora(): Promise<boolean> {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const minha = ++ultimaVersaoRef.current;
    const lista = anexosRef.current.map(({ id, legenda, tamanho }) => ({ id, legenda, tamanho }));
    setEstado("salvando");
    const resultado = filaRef.current.then(() => salvarAnexosOrcamentoAction(orcamentoId, lista));
    filaRef.current = resultado.catch(() => null);
    return resultado.then(
      (r) => {
        const ok = "ok" in r;
        if (minha === ultimaVersaoRef.current) setEstado(ok ? "salvo" : "erro");
        if (!ok) setAviso(r.error);
        return ok;
      },
      () => {
        if (minha === ultimaVersaoRef.current) setEstado("erro");
        return false;
      },
    );
  }

  // Salva sozinho pouco depois da última mudança (o tamanho muda a cada passo do controle).
  useEffect(() => {
    if (versao === 0) return;
    timerRef.current = setTimeout(() => void salvarAgora(), 800);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- salvarAgora lê tudo por ref
  }, [versao]);

  // Avisa antes de sair com mudança ainda não salva.
  useEffect(() => {
    if (estado === "salvo" && enviando === 0) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [estado, enviando]);

  function atualizar(id: string, patch: Partial<Pick<AnexoOrcamentoVM, "legenda" | "tamanho">>) {
    mudar((atuais) => atuais.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function mover(indice: number, delta: number) {
    mudar((atuais) => {
      const destino = indice + delta;
      if (destino < 0 || destino >= atuais.length) return atuais;
      const copia = [...atuais];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });
  }

  function escolherNaFolha(id: string) {
    setSelecionado(id);
    linhasRef.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function enviar(arquivos: File[]) {
    const imagens = arquivos.filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (imagens.length === 0) return;
    const vagas = MAX_ANEXOS - anexosRef.current.length;
    if (vagas <= 0) {
      setAviso(`No máximo ${MAX_ANEXOS} imagens por orçamento — exclua alguma antes.`);
      return;
    }
    const lote = imagens.slice(0, vagas);
    setAviso(imagens.length > vagas ? `Só cabiam mais ${vagas} — as outras ficaram de fora.` : null);
    setEnviando(lote.length);
    for (const arquivo of lote) {
      const form = new FormData();
      form.append("imagem", await reduzirImagem(arquivo), arquivo.name.replace(/\.[^.]+$/, "") + ".jpg");
      const r = await enviarAnexoOrcamentoAction(orcamentoId, form).catch(() => ({ error: "Falha ao enviar a imagem — tente de novo." }));
      setEnviando((n) => n - 1);
      if ("error" in r) {
        setAviso(`${arquivo.name}: ${r.error}`);
        break;
      }
      mudar((atuais) => [...atuais, r.anexo], false);
      setSelecionado(r.anexo.id);
    }
    setEnviando(0);
  }

  async function excluir(anexo: AnexoOrcamentoVM) {
    if (!confirm("Tirar essa imagem do orçamento?")) return;
    await excluirAnexoOrcamentoAction(orcamentoId, anexo.id);
    mudar((atuais) => atuais.filter((a) => a.id !== anexo.id), false);
  }

  async function verPdf() {
    if (estado !== "salvo" && !(await salvarAgora())) return;
    window.open(`/api/pdf/orcamento/${orcamentoId}?ver=1`, "_blank");
  }

  return (
    <section
      className={cn("space-y-3 rounded-lg border p-4", arrastando && "border-primary bg-primary/5")}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastando(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setArrastando(false);
        void enviar(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Imagens anexas</h2>
          <p className="text-xs text-muted-foreground">
            Saem numa folha depois do orçamento: no PDF, na impressão e no link do cliente.
            {anexos.length > 0 && <span className={cn("ml-1", estado === "erro" && "text-destructive")}>{TEXTO_ESTADO[estado]}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          {anexos.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={verPdf}>
              <Eye className="size-4" />
              Ver PDF
            </Button>
          )}
          <Button type="button" size="sm" onClick={() => arquivoRef.current?.click()} disabled={enviando > 0 || anexos.length >= MAX_ANEXOS}>
            {enviando > 0 ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            {enviando > 0 ? `Enviando (${enviando})...` : "Anexar imagens"}
          </Button>
          <input
            ref={arquivoRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const arquivos = Array.from(e.target.files ?? []);
              e.target.value = "";
              void enviar(arquivos);
            }}
          />
        </div>
      </div>

      {aviso && <p className="text-sm text-destructive">{aviso}</p>}

      {anexos.length === 0 ? (
        <button
          type="button"
          onClick={() => arquivoRef.current?.click()}
          disabled={enviando > 0}
          className="w-full rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground hover:bg-muted/40"
        >
          {enviando > 0 ? "Enviando..." : "Nenhuma imagem anexa. Clique aqui ou arraste as imagens (projeto 3D, fotos do espaço, planta...)."}
        </button>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 md:grid-cols-[minmax(0,1fr)_15rem]">
          <ul className="space-y-2">
            {anexos.map((a, i) => (
              <li
                key={a.id}
                ref={(el) => {
                  if (el) linhasRef.current.set(a.id, el);
                  else linhasRef.current.delete(a.id);
                }}
                onClick={() => setSelecionado(a.id)}
                className={cn("flex gap-3 rounded-md border bg-card p-2", selecionado === a.id && "ring-2 ring-primary/50")}
              >
                <img src={urlAnexo(a.id)} alt="" className="size-16 shrink-0 rounded bg-muted object-contain" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-1">
                    <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={a.nome ?? undefined}>
                      {a.nome || "Imagem"} · {a.largura}×{a.altura}
                    </p>
                    <Button type="button" variant="ghost" size="icon-sm" title="Subir" disabled={i === 0} onClick={() => mover(i, -1)}>
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" title="Descer" disabled={i === anexos.length - 1} onClick={() => mover(i, 1)}>
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" title="Excluir" onClick={() => excluir(a)}>
                      <Trash2 className="size-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                  <Input
                    value={a.legenda ?? ""}
                    onChange={(e) => atualizar(a.id, { legenda: e.target.value })}
                    placeholder="Legenda (opcional)"
                    maxLength={LEGENDA_MAX}
                    className="h-8 text-xs"
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Tamanho</span>
                    {TAMANHOS_RAPIDOS.map((t) => (
                      <button
                        key={t.valor}
                        type="button"
                        onClick={() => atualizar(a.id, { tamanho: t.valor })}
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted",
                          a.tamanho === t.valor && "border-primary bg-primary/10 text-primary",
                        )}
                      >
                        {t.rotulo}
                      </button>
                    ))}
                    <div className="flex min-w-32 flex-1 items-center gap-1.5">
                      <input
                        type="range"
                        min={TAMANHO_MIN}
                        max={TAMANHO_MAX}
                        value={a.tamanho}
                        onChange={(e) => atualizar(a.id, { tamanho: Number(e.target.value) })}
                        aria-label="Tamanho da imagem na folha"
                        className="h-1.5 min-w-0 flex-1 accent-primary"
                      />
                      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{a.tamanho}%</span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="space-y-3 md:sticky md:top-4">
            {folhas.map((folha, i) => (
              <div key={i} className="space-y-1">
                <p className="text-[11px] text-muted-foreground">
                  Folha de anexos {folhas.length > 1 ? `${i + 1} de ${folhas.length}` : ""}
                </p>
                <FolhaAnexos folha={folha} numero={numero} src={(id) => urlAnexo(id)} selecionado={selecionado} onEscolher={escolherNaFolha} />
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">Clique numa imagem da folha pra achar ela na lista.</p>
          </div>
        </div>
      )}
    </section>
  );
}
