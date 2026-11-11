"use client";

/* eslint-disable @next/next/no-img-element -- miniaturas (modelo, fotos de produto e imagens enviadas), sem otimização do next/image */

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Eye,
  FileText,
  Images,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  Receipt,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  MAX_IMAGENS,
  NOME_PAGINA,
  PAGINAS_AVULSAS,
  PAGINAS_FIXAS,
  apresentacaoPadrao,
  imagensUsadas,
  novaPagina,
  paginaVazia,
  paginasDoCliente,
  semImagem,
  type ImagemApresentacaoVM,
  type OrcamentoParaApresentacao,
  type PaginaApresentacao,
  type TipoPagina,
} from "@/lib/utils/apresentacao";
import { reduzirImagem } from "@/lib/utils/reduzir-imagem";
import { CamposPagina, urlImagem } from "./campos-pagina";
import {
  enviarApresentacaoWhatsAppAction,
  enviarImagemApresentacaoAction,
  excluirImagemApresentacaoAction,
  recomecarApresentacaoAction,
  salvarApresentacaoAction,
} from "./actions";

// Editor da apresentação do orçamento (pedido de 2026-11-06): escolher as
// páginas que vão pro cliente, mudar a ordem, editar os textos, acrescentar
// páginas e imagens. Salva sozinho logo depois de cada mudança.

const MINIATURA: Partial<Record<TipoPagina, string>> = {
  capa: "p1",
  sobre: "p2",
  portfolio: "p3",
  clientes: "p4",
  ecossistema: "p5",
  "como-funciona": "p6",
  projeto: "p7",
  modelo: "p8",
  contato: "p9",
};
const ICONE: Partial<Record<TipoPagina, typeof Receipt>> = { investimento: Receipt, galeria: Images, informacoes: FileText };
const FIXAS: readonly TipoPagina[] = PAGINAS_FIXAS;
const AVULSAS: readonly TipoPagina[] = PAGINAS_AVULSAS;

const novoId = (tipo: TipoPagina) => `${tipo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type Estado = "salvo" | "alterado" | "salvando" | "erro";

function miniaturaDaPagina(p: PaginaApresentacao, orcamento: OrcamentoParaApresentacao): string | null {
  if ("imagens" in p && p.imagens[0]) return urlImagem(p.imagens[0]);
  if (p.tipo === "modelo" && orcamento.itens[p.item]?.fotoUrl) return orcamento.itens[p.item].fotoUrl;
  const modelo = MINIATURA[p.tipo];
  return modelo ? `/apresentacao/miniaturas/${modelo}.jpg` : null;
}

function resumoDaPagina(p: PaginaApresentacao, orcamento: OrcamentoParaApresentacao): string {
  switch (p.tipo) {
    case "modelo":
      return p.modelo || orcamento.itens[p.item]?.nome || "Sem item do orçamento";
    case "projeto":
      return [p.cliente, p.local].filter(Boolean).join(" · ") || "Fotos e dados de uma obra já entregue";
    case "galeria":
    case "informacoes":
    case "investimento":
      return p.titulo;
    case "capa":
      return p.proposta || (orcamento.cliente ? `Proposta para ${orcamento.cliente}` : p.titulo);
    case "contato":
      return p.telefone;
    default:
      return FIXAS.includes(p.tipo) ? "Página fixa do modelo" : "";
  }
}

export function ApresentacaoEditor({
  orcamentoId,
  orcamento,
  paginasIniciais,
  imagensIniciais,
  telefoneCliente,
}: {
  orcamentoId: string;
  orcamento: OrcamentoParaApresentacao;
  paginasIniciais: PaginaApresentacao[];
  imagensIniciais: ImagemApresentacaoVM[];
  telefoneCliente: string | null;
}) {
  const [paginas, setPaginas] = useState(paginasIniciais);
  const [imagens, setImagens] = useState(imagensIniciais);
  const [aberta, setAberta] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>("salvo");
  const [versao, setVersao] = useState(0);
  const [enviandoImagens, setEnviandoImagens] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [whatsAberto, setWhatsAberto] = useState(false);
  const [telefone, setTelefone] = useState(telefoneCliente ?? "");
  const [enviandoWhats, setEnviandoWhats] = useState(false);
  const [resultadoWhats, setResultadoWhats] = useState<{ ok: boolean; texto: string } | null>(null);

  const arquivoRef = useRef<HTMLInputElement>(null);
  // Página que recebe as imagens enviadas pelo botão "Enviar" de dentro dela.
  const destinoRef = useRef<string | null>(null);
  const paginasRef = useRef(paginas);
  const filaRef = useRef<Promise<unknown>>(Promise.resolve());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimaVersaoRef = useRef(0);

  const pdfUrl = `/api/pdf/orcamento/${orcamentoId}/apresentacao`;
  const doCliente = paginasDoCliente(paginas);

  function mudarPaginas(atualizar: (atuais: PaginaApresentacao[]) => PaginaApresentacao[]) {
    const novas = atualizar(paginasRef.current);
    paginasRef.current = novas;
    setPaginas(novas);
    setEstado("alterado");
    setVersao((v) => v + 1);
  }

  /** Salva já (em fila, pra não chegar fora de ordem no servidor). */
  function salvarAgora(): Promise<boolean> {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const minha = ++ultimaVersaoRef.current;
    const lista = paginasRef.current;
    setEstado("salvando");
    const resultado = filaRef.current.then(() => salvarApresentacaoAction(orcamentoId, lista));
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

  // Salva sozinho pouco depois da última mudança.
  useEffect(() => {
    if (versao === 0) return;
    timerRef.current = setTimeout(() => void salvarAgora(), 1200);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- salvarAgora lê tudo por ref
  }, [versao]);

  // Avisa antes de sair com mudança ainda não salva.
  useEffect(() => {
    if (estado === "salvo") return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [estado]);

  async function abrirPdf(baixar: boolean) {
    if (doCliente.length === 0) {
      setAviso("Marque pelo menos uma página pra ir ao cliente.");
      return;
    }
    if (estado !== "salvo" && !(await salvarAgora())) return;
    if (baixar) {
      const a = document.createElement("a");
      a.href = pdfUrl;
      a.click();
    } else {
      window.open(`${pdfUrl}?ver=1`, "_blank");
    }
  }

  function trocar(id: string, nova: PaginaApresentacao) {
    mudarPaginas((atuais) => atuais.map((p) => (p.id === id ? nova : p)));
  }

  function mover(indice: number, delta: number) {
    mudarPaginas((atuais) => {
      const destino = indice + delta;
      if (destino < 0 || destino >= atuais.length) return atuais;
      const copia = [...atuais];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });
  }

  function acrescentar(tipo: TipoPagina) {
    const usados = new Set(paginasRef.current.flatMap((p) => (p.tipo === "modelo" ? [p.item] : [])));
    const item = tipo === "modelo" ? orcamento.itens.findIndex((_, i) => !usados.has(i)) : -1;
    const pagina = novaPagina(tipo, novoId(tipo), item);
    mudarPaginas((atuais) => {
      // Entra antes do contato (última página do modelo), se ele estiver no fim.
      const fim = atuais.at(-1)?.tipo === "contato" ? atuais.length - 1 : atuais.length;
      return [...atuais.slice(0, fim), pagina, ...atuais.slice(fim)];
    });
    setAberta(pagina.id);
  }

  function excluirPagina(p: PaginaApresentacao) {
    if (!confirm(`Tirar a página "${NOME_PAGINA[p.tipo]}" da apresentação?`)) return;
    mudarPaginas((atuais) => atuais.filter((x) => x.id !== p.id));
  }

  async function recomecar() {
    if (!confirm("Voltar a apresentação para o padrão do orçamento? As mudanças nas páginas se perdem (as imagens enviadas continuam guardadas).")) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    ++ultimaVersaoRef.current;
    await filaRef.current;
    await recomecarApresentacaoAction(orcamentoId);
    const padrao = apresentacaoPadrao(orcamento);
    paginasRef.current = padrao;
    setPaginas(padrao);
    setAberta(null);
    setEstado("salvo");
  }

  function escolherArquivos(destino: string | null) {
    destinoRef.current = destino;
    arquivoRef.current?.click();
  }

  async function enviarArquivos(arquivos: File[]) {
    const destino = destinoRef.current;
    destinoRef.current = null;
    setAviso(null);
    setEnviandoImagens(arquivos.length);
    const novas: ImagemApresentacaoVM[] = [];
    for (const arquivo of arquivos) {
      const form = new FormData();
      form.append("imagem", await reduzirImagem(arquivo),arquivo.name.replace(/\.[^.]+$/, "") + ".jpg");
      const r = await enviarImagemApresentacaoAction(orcamentoId, form).catch(() => ({ error: "Falha ao enviar a imagem — tente de novo." }));
      setEnviandoImagens((n) => n - 1);
      if ("error" in r) {
        setAviso(`${arquivo.name}: ${r.error}`);
        break;
      }
      novas.push(r.imagem);
      setImagens((atuais) => [...atuais, r.imagem]);
    }
    setEnviandoImagens(0);
    if (destino && novas.length > 0) {
      const pagina = paginasRef.current.find((p) => p.id === destino);
      if (pagina && "imagens" in pagina) {
        const max = MAX_IMAGENS[pagina.tipo] ?? 1;
        const ids = max === 1 ? [novas[0].id] : [...pagina.imagens, ...novas.map((n) => n.id)].slice(0, max);
        trocar(destino, { ...pagina, imagens: ids });
      }
    }
  }

  async function excluirImagem(img: ImagemApresentacaoVM) {
    const usos = paginasRef.current.filter((p) => "imagens" in p && p.imagens.includes(img.id)).length;
    const pergunta = usos > 0 ? `Essa imagem está em ${usos} página(s). Excluir mesmo assim?` : "Excluir essa imagem?";
    if (!confirm(pergunta)) return;
    await excluirImagemApresentacaoAction(orcamentoId, img.id);
    setImagens((atuais) => atuais.filter((i) => i.id !== img.id));
    if (usos > 0) mudarPaginas((atuais) => semImagem(atuais, img.id));
  }

  async function enviarWhatsApp() {
    setResultadoWhats(null);
    setEnviandoWhats(true);
    if (estado !== "salvo" && !(await salvarAgora())) {
      setEnviandoWhats(false);
      return;
    }
    const r = await enviarApresentacaoWhatsAppAction(orcamentoId, telefone).catch(() => ({ error: "Não foi possível enviar agora." }));
    setEnviandoWhats(false);
    setResultadoWhats("ok" in r ? { ok: true, texto: "Entrou na fila de envio do WhatsApp." } : { ok: false, texto: r.error });
  }

  const usadas = new Set(imagensUsadas(paginas));
  const textoEstado = { salvo: "Tudo salvo", alterado: "Mudanças por salvar…", salvando: "Salvando…", erro: "Não salvou" }[estado];

  return (
    <div className="space-y-5">
      <input
        ref={arquivoRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const arquivos = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (arquivos.length > 0) void enviarArquivos(arquivos);
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void abrirPdf(false)}>
          <Eye className="size-4" />
          Ver a apresentação
        </Button>
        <Button variant="outline" onClick={() => void abrirPdf(true)}>
          <Download className="size-4" />
          Baixar PDF
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setResultadoWhats(null);
            setWhatsAberto(true);
          }}
          disabled={doCliente.length === 0}
        >
          <MessageCircle className="size-4" />
          Enviar pelo WhatsApp
        </Button>
        <span className={cn("ml-auto flex items-center gap-1.5 text-xs", estado === "erro" ? "text-destructive" : "text-muted-foreground")}>
          {estado === "salvando" && <Loader2 className="size-3 animate-spin" />}
          {textoEstado}
          {estado === "erro" && (
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => void salvarAgora()}>
              tentar de novo
            </Button>
          )}
        </span>
      </div>

      {aviso && (
        <div className="flex items-start justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {aviso}
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">
            <X className="size-4" />
          </button>
        </div>
      )}

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Imagens extras</h2>
            <p className="text-sm text-muted-foreground">Fotos de obras, projeto 3D, planta do espaço… Depois escolha em qual página cada uma entra.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => escolherArquivos(null)} disabled={enviandoImagens > 0}>
            {enviandoImagens > 0 ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {enviandoImagens > 0 ? `Enviando ${enviandoImagens}…` : "Enviar imagens"}
          </Button>
        </div>
        {imagens.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {imagens.map((img) => (
              <div key={img.id} className="group relative size-20 overflow-hidden rounded-md border">
                <img src={urlImagem(img.id)} alt={img.nome ?? "Imagem enviada"} className="size-full object-cover" loading="lazy" />
                {!usadas.has(img.id) && <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 text-center text-[10px] text-white">sem página</span>}
                <button
                  type="button"
                  onClick={() => void excluirImagem(img)}
                  className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white hover:bg-destructive"
                  aria-label="Excluir imagem"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma imagem enviada ainda.</p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold">Páginas</h2>
            <p className="text-sm text-muted-foreground">
              {doCliente.length} de {paginas.length} vão para o cliente. Desmarque as que não quiser mandar.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void recomecar()}>
            <RotateCcw className="size-4" />
            Recomeçar do orçamento
          </Button>
        </div>

        <ol className="space-y-2">
          {paginas.map((p, i) => {
            const miniatura = miniaturaDaPagina(p, orcamento);
            const Icone = ICONE[p.tipo] ?? FileText;
            const vazia = paginaVazia(p);
            const editavel = !FIXAS.includes(p.tipo);
            const estaAberta = aberta === p.id;
            return (
              <li key={p.id} className={cn("rounded-lg border bg-card", !p.incluir && "bg-muted/40")}>
                {/* No celular os controles descem pra uma segunda linha (sobra espaço pro nome). */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2">
                  <button
                    type="button"
                    onClick={() => editavel && setAberta(estaAberta ? null : p.id)}
                    className={cn("relative h-[45px] w-20 shrink-0 overflow-hidden rounded border bg-muted sm:h-[54px] sm:w-24", !p.incluir && "opacity-40", !editavel && "cursor-default")}
                    aria-label={editavel ? `Editar ${NOME_PAGINA[p.tipo]}` : NOME_PAGINA[p.tipo]}
                  >
                    {miniatura ? (
                      <img src={miniatura} alt="" className="size-full object-cover" loading="lazy" />
                    ) : (
                      <span className="flex size-full items-center justify-center text-muted-foreground">
                        <Icone className="size-5" />
                      </span>
                    )}
                  </button>
                  <div className={cn("min-w-0 flex-1", !p.incluir && "opacity-60")}>
                    <p className="truncate text-sm font-medium">
                      {i + 1}. {NOME_PAGINA[p.tipo]}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{resumoDaPagina(p, orcamento)}</p>
                    {p.incluir && vazia && <p className="text-xs text-amber-700 dark:text-amber-400">Ainda vazia — só vai quando tiver conteúdo.</p>}
                  </div>
                  <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs">
                      <Checkbox checked={p.incluir} onCheckedChange={(v) => trocar(p.id, { ...p, incluir: v === true })} aria-label="Vai para o cliente" />
                      Vai pro cliente
                    </label>
                    <div className="flex shrink-0 items-center">
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir">
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => mover(i, 1)} disabled={i === paginas.length - 1} aria-label="Descer">
                        <ArrowDown className="size-4" />
                      </Button>
                      {/* Espaço vazio no lugar do botão que a página não tem, pra manter tudo alinhado. */}
                      {editavel ? (
                        <Button variant={estaAberta ? "secondary" : "ghost"} size="icon" className="size-8" onClick={() => setAberta(estaAberta ? null : p.id)} aria-label="Editar">
                          <Pencil className="size-4" />
                        </Button>
                      ) : (
                        <span className="size-8" />
                      )}
                      {AVULSAS.includes(p.tipo) ? (
                        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => excluirPagina(p)} aria-label="Tirar página">
                          <Trash2 className="size-4" />
                        </Button>
                      ) : (
                        <span className="size-8" />
                      )}
                    </div>
                  </div>
                </div>
                {estaAberta && (
                  <div className="border-t p-3">
                    <CamposPagina
                      pagina={p}
                      orcamento={orcamento}
                      imagens={imagens}
                      onChange={(nova) => trocar(p.id, nova)}
                      onEnviarImagens={() => escolherArquivos(p.id)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap gap-2">
          {(["projeto", "galeria", "informacoes", "modelo"] as const).map((tipo) => (
            <Button key={tipo} variant="outline" size="sm" onClick={() => acrescentar(tipo)}>
              <Plus className="size-3.5" />
              {tipo === "modelo" ? "Modelo de outro item" : NOME_PAGINA[tipo]}
            </Button>
          ))}
        </div>
      </section>

      <Dialog open={whatsAberto} onOpenChange={setWhatsAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar a apresentação pelo WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="telefone-apresentacao">Telefone do cliente</Label>
            <Input id="telefone-apresentacao" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(55) 99999-9999" inputMode="tel" />
            <p className="text-xs text-muted-foreground">Vai o PDF com as {doCliente.length} páginas marcadas, com uma mensagem curta.</p>
            {resultadoWhats && <p className={cn("text-sm", resultadoWhats.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>{resultadoWhats.texto}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWhatsAberto(false)}>
              Fechar
            </Button>
            <Button onClick={() => void enviarWhatsApp()} disabled={enviandoWhats || resultadoWhats?.ok === true}>
              {enviandoWhats ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
