"use client";

import { useEffect, useRef, useState, useTransition, type PointerEvent as PointerEventReact } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Crosshair, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { salvarArteAction } from "@/app/(app)/marketing/actions";
import {
  CORES_MARCA,
  DESLOCAMENTO_LETRA_TITULO,
  LOGO_PROPORCAO,
  MARGEM_STORY,
  RAIO_FOTO,
  comMaiuscula,
  contornoTitulo,
  coresSelo,
  iconeCheckSvg,
  linhasDoTitulo,
  medidasSelo,
  recorteDaFoto,
  type DadosArte,
  type ElementoArte,
  type ElementoLogo,
  type ElementoSelo,
  type ElementoTitulo,
  type FormatoArte,
} from "@/lib/utils/postagem-arte";

// Editor de uma arte (etapa 2, 2026-10-17): a prévia ao vivo é desenhada no
// navegador com as mesmas fontes e medidas do renderizador do servidor
// (lib/server/postagem-render.ts), só pra arrastar com fluidez. A arte final
// — a que vai ser aprovada e publicada — é sempre a do servidor, mostrada ao
// lado depois de salvar. A logo só muda de tamanho e posição.

type FotoPost = { id: string; largura: number; altura: number };
type Selecao = { tipo: "foto"; i: number } | { tipo: "elemento"; id: string } | null;
type Arrasto = { alvo: NonNullable<Selecao>; x0: number; y0: number; inicio: DadosArte };

const FONTES = `
@font-face { font-family: "Baloo2Marca"; src: url(/fontes-marca/Baloo2-ExtraBold.ttf) format("truetype"); font-weight: 800; font-display: block; }
@font-face { font-family: "NunitoMarca"; src: url(/fontes-marca/Nunito-Black.ttf) format("truetype"); font-weight: 900; font-display: block; }
`;
const SELOS_PADRAO = ["Diversão Garantida", "Qualidade e Segurança"];
/** Largura média de um caractere do título — só pra área de toque e o contorno de seleção. */
const LARGURA_CARACTERE = 0.56;

const limitar = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const svgUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function caixaTitulo(e: ElementoTitulo) {
  const escala = e.escala || 1;
  const largura = Math.max(...e.linhas.map((l) => l.t.length * l.tam * escala * LARGURA_CARACTERE + contornoTitulo(l.tam * escala) * 2), 80);
  return { largura, altura: linhasDoTitulo(e.linhas, escala).altura + 14 };
}

function caixaSelo(e: ElementoSelo) {
  const m = medidasSelo(e.tam);
  return { largura: m.margem * 2 + m.raioIcone * 2 + m.espaco + e.t.length * e.tam * 0.6, altura: m.h };
}

function TituloPrevia({ e }: { e: ElementoTitulo }) {
  const escala = e.escala || 1;
  const { topos } = linhasDoTitulo(e.linhas, escala);
  return (
    <>
      {e.linhas.map((l, i) => {
        const tam = Math.round(l.tam * escala);
        const base = { position: "absolute", left: 0, top: 0, whiteSpace: "nowrap", fontFamily: "Baloo2Marca", fontWeight: 800, fontSize: tam, lineHeight: 1 } as const;
        return (
          <div key={i} style={{ position: "absolute", left: 0, top: topos[i] + Math.round(tam * DESLOCAMENTO_LETRA_TITULO) }}>
            <span style={{ ...base, color: CORES_MARCA.branco, WebkitTextStroke: `${contornoTitulo(tam) * 2}px ${CORES_MARCA.branco}`, textShadow: "0px 10px 12px rgba(0,0,0,0.32)" }}>{l.t}</span>
            <span style={{ ...base, color: CORES_MARCA[l.cor] }}>{l.t}</span>
          </div>
        );
      })}
    </>
  );
}

function SeloPrevia({ e }: { e: ElementoSelo }) {
  const { fundo, texto } = coresSelo(e.estilo);
  const m = medidasSelo(e.tam);
  return (
    <div
      style={{
        height: m.h,
        display: "flex",
        alignItems: "center",
        gap: m.espaco,
        paddingLeft: m.margem,
        paddingRight: m.margem,
        borderRadius: m.h / 2,
        background: fundo,
        boxShadow: "0px 10px 12px rgba(0,0,0,0.27)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={svgUri(iconeCheckSvg(m.raioIcone, texto, fundo))} alt="" width={m.raioIcone * 2} height={m.raioIcone * 2} draggable={false} />
      <span style={{ fontFamily: "NunitoMarca", fontWeight: 900, fontSize: e.tam, color: texto, lineHeight: 1, whiteSpace: "nowrap" }}>{e.t}</span>
    </div>
  );
}

export function EditorArte(props: {
  postId: string;
  numero: number;
  arteId: string;
  rotulo: string;
  formato: FormatoArte;
  dadosIniciais: DadosArte;
  fotosPost: FotoPost[];
  versao: number;
  aprovado: boolean;
  anteriorId: string | null;
  proximaId: string | null;
}) {
  const { postId, arteId, fotosPost, formato } = props;
  const router = useRouter();
  const [salvo, setSalvo] = useState(props.dadosIniciais);
  const [dados, setDados] = useState(props.dadosIniciais);
  const [selecao, setSelecao] = useState<Selecao>(() => {
    const titulo = props.dadosIniciais.elementos.find((e) => e.tipo === "titulo");
    return titulo ? { tipo: "elemento", id: titulo.id } : props.dadosIniciais.fotos.length ? { tipo: "foto", i: 0 } : null;
  });
  const [pending, startTransition] = useTransition();
  const [finalCarregada, setFinalCarregada] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const [largTela, setLargTela] = useState(360);
  const arrasto = useRef<Arrasto | null>(null);

  const { w, h } = dados;
  const escala = largTela / w;
  const alterado = JSON.stringify(dados) !== JSON.stringify(salvo);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const medir = () => setLargTela(el.clientWidth || 360);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!alterado) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [alterado]);

  const fotoDoPost = (id: string) => fotosPost.find((f) => f.id === id) ?? { id, largura: 1, altura: 1 };
  const elemento = selecao?.tipo === "elemento" ? dados.elementos.find((e) => e.id === selecao.id) : undefined;
  const selos = dados.elementos.filter((e): e is ElementoSelo => e.tipo === "selo");
  const titulo = dados.elementos.find((e): e is ElementoTitulo => e.tipo === "titulo");

  function trocarElemento(id: string, mudar: (e: ElementoArte) => ElementoArte) {
    setDados((d) => ({ ...d, elementos: d.elementos.map((e) => (e.id === id ? mudar(e) : e)) }));
  }

  function trocarFoto(i: number, mudar: Partial<DadosArte["fotos"][number]>) {
    setDados((d) => ({ ...d, fotos: d.fotos.map((f, j) => (j === i ? { ...f, ...mudar } : f)) }));
  }

  function comecar(e: PointerEventReact, alvo: NonNullable<Selecao>) {
    e.stopPropagation();
    e.preventDefault();
    area.current?.setPointerCapture(e.pointerId);
    arrasto.current = { alvo, x0: e.clientX, y0: e.clientY, inicio: dados };
    setSelecao(alvo);
  }

  function mover(e: PointerEventReact) {
    const a = arrasto.current;
    if (!a) return;
    const dx = (e.clientX - a.x0) / escala;
    const dy = (e.clientY - a.y0) / escala;
    if (a.alvo.tipo === "foto") {
      const i = a.alvo.i;
      const f = a.inicio.fotos[i];
      const r = recorteDaFoto(fotoDoPost(f.imagemId), f);
      // Arrastar a foto pra direita mostra mais da esquerda: o ponto focal anda ao contrário.
      const fx = r.rw > r.w ? limitar(f.fx - dx / r.rw, r.w / 2 / r.rw, 1 - r.w / 2 / r.rw) : f.fx;
      const fy = r.rh > r.h ? limitar(f.fy - dy / r.rh, r.h / 2 / r.rh, 1 - r.h / 2 / r.rh) : f.fy;
      trocarFoto(i, { fx, fy });
      return;
    }
    const id = a.alvo.id;
    const ini = a.inicio.elementos.find((x) => x.id === id);
    if (!ini) return;
    if (ini.tipo === "logo") {
      const alturaLogo = ini.larg * LOGO_PROPORCAO;
      let cx = limitar(ini.cx + dx, ini.larg / 2, w - ini.larg / 2);
      // Imã no centro: a logo centralizada é o padrão da marca.
      if (Math.abs(cx - w / 2) < 14) cx = w / 2;
      trocarElemento(id, () => ({ ...ini, cx: Math.round(cx), base: Math.round(limitar(ini.base + dy, alturaLogo, h)) }));
    } else {
      trocarElemento(id, () => ({ ...ini, x: Math.round(limitar(ini.x + dx, 0, w - 40)), y: Math.round(limitar(ini.y + dy, 0, h - 40)) }));
    }
  }

  function soltar() {
    arrasto.current = null;
  }

  function adicionarSelo() {
    const usados = new Set(selos.map((s) => s.estilo));
    const estilo: ElementoSelo["estilo"] = usados.has("laranja") ? "branco" : "laranja";
    const tam = formato === "STORY" ? 30 : 27;
    const ultimo = selos.at(-1);
    const y = ultimo
      ? ultimo.y + medidasSelo(ultimo.tam).h + 12
      : titulo
        ? titulo.y + linhasDoTitulo(titulo.linhas, titulo.escala).altura + (formato === "STORY" ? 24 : 22)
        : formato === "STORY" ? MARGEM_STORY : 62;
    const texto = SELOS_PADRAO.find((t) => !selos.some((s) => s.t === t)) ?? "Novo selo";
    const novo: ElementoSelo = { id: `selo-novo-${Date.now()}`, tipo: "selo", x: titulo?.x ?? 66, y: Math.round(y), t: texto, tam, estilo };
    setDados((d) => ({ ...d, elementos: [...d.elementos.filter((e) => e.tipo !== "logo"), novo, ...d.elementos.filter((e) => e.tipo === "logo")] }));
    setSelecao({ tipo: "elemento", id: novo.id });
  }

  function salvar(depois?: () => void) {
    startTransition(async () => {
      const r = await salvarArteAction(arteId, dados);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setSalvo(dados);
      setFinalCarregada(false);
      toast.success(r.voltouPraRevisao ? "Ajustes salvos — o post voltou pra revisão." : "Ajustes salvos.");
      router.refresh();
      depois?.();
    });
  }

  function irPara(id: string | null) {
    if (!id) return;
    if (alterado && !confirm("Há ajustes não salvos nesta arte. Sair sem salvar?")) return;
    router.push(`/marketing/${postId}/arte/${id}`);
  }

  // Story: título e selos fora dos 250 px de cima e de baixo (botões do Instagram).
  const naMargem =
    formato === "STORY" &&
    dados.elementos.some((e) => {
      if (e.tipo === "logo") return false;
      const altura = e.tipo === "titulo" ? caixaTitulo(e).altura : medidasSelo(e.tam).h;
      return e.y < MARGEM_STORY || e.y + altura > h - MARGEM_STORY;
    });

  const contornoSelecao = (sel: boolean) => (sel ? { outline: `${Math.max(3, 2 / escala)}px dashed ${CORES_MARCA.branco}`, outlineOffset: 6 } : {});

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <style>{FONTES}</style>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-3 shadow-xs sm:px-6">
        <div>
          <Link href={`/marketing/${postId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" onClick={(e) => alterado && !confirm("Há ajustes não salvos. Sair sem salvar?") && e.preventDefault()}>
            <ChevronLeft className="size-4" />
            Post #{props.numero}
          </Link>
          <h1 className="text-lg font-bold tracking-tight">Ajustar arte · {props.rotulo}</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" disabled={!props.anteriorId} onClick={() => irPara(props.anteriorId)} aria-label="Arte anterior">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon" disabled={!props.proximaId} onClick={() => irPara(props.proximaId)} aria-label="Próxima arte">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,480px)_1fr]">
        <div className="space-y-2">
          <div
            ref={area}
            className="relative mx-auto w-full touch-none select-none overflow-hidden rounded-lg shadow-sm"
            // No celular, o story não passa de 68% da altura da tela: os controles ficam à vista logo abaixo.
            style={{ aspectRatio: `${w} / ${h}`, maxWidth: `calc(68vh * ${w} / ${h})` }}
            onPointerMove={mover}
            onPointerUp={soltar}
            onPointerCancel={soltar}
            onPointerDown={() => setSelecao(null)}
          >
            <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, transform: `scale(${escala})`, transformOrigin: "0 0", background: CORES_MARCA.teal }}>
              {dados.fotos.map((f, i) => {
                const r = recorteDaFoto(fotoDoPost(f.imagemId), f);
                const sel = selecao?.tipo === "foto" && selecao.i === i;
                return (
                  <div
                    key={i}
                    onPointerDown={(e) => comecar(e, { tipo: "foto", i })}
                    style={{ position: "absolute", left: f.box[0], top: f.box[1], width: r.w, height: r.h, borderRadius: RAIO_FOTO, overflow: "hidden", cursor: "grab" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/imagem/postagem-imagem/${f.imagemId}`} alt="" draggable={false} style={{ position: "absolute", left: -r.left, top: -r.top, width: r.rw, height: r.rh, maxWidth: "none", pointerEvents: "none" }} />
                    {sel && (
                      <div style={{ position: "absolute", inset: 0, borderRadius: RAIO_FOTO, boxShadow: `inset 0 0 0 ${Math.max(5, 3 / escala)}px ${CORES_MARCA.laranja}`, pointerEvents: "none" }} />
                    )}
                  </div>
                );
              })}

              {dados.elementos.map((e) => {
                const sel = selecao?.tipo === "elemento" && selecao.id === e.id;
                if (e.tipo === "logo") {
                  const alturaLogo = Math.round(e.larg * LOGO_PROPORCAO);
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={e.id}
                      src="/legaus-logo.png"
                      alt="Logo Legaus Kids"
                      draggable={false}
                      onPointerDown={(ev) => comecar(ev, { tipo: "elemento", id: e.id })}
                      style={{ position: "absolute", left: Math.round(e.cx - e.larg / 2), top: Math.round(e.base - alturaLogo), width: e.larg, height: alturaLogo, cursor: "grab", ...contornoSelecao(sel) }}
                    />
                  );
                }
                const caixa = e.tipo === "titulo" ? caixaTitulo(e) : caixaSelo(e);
                return (
                  <div
                    key={e.id}
                    onPointerDown={(ev) => comecar(ev, { tipo: "elemento", id: e.id })}
                    style={{ position: "absolute", left: e.x, top: e.y, width: caixa.largura, height: caixa.altura, cursor: "grab", ...contornoSelecao(sel) }}
                  >
                    {e.tipo === "titulo" ? <TituloPrevia e={e} /> : <SeloPrevia e={e} />}
                  </div>
                );
              })}

              {formato === "STORY" &&
                [0, h - MARGEM_STORY].map((topo) => (
                  <div
                    key={topo}
                    style={{ position: "absolute", left: 0, top: topo, width: w, height: MARGEM_STORY, background: "rgba(0,0,0,0.18)", borderTop: topo ? "4px dashed rgba(255,255,255,0.8)" : undefined, borderBottom: topo ? undefined : "4px dashed rgba(255,255,255,0.8)", pointerEvents: "none" }}
                  />
                ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Toque e arraste o título, os selos, a logo ou a foto (pra enquadrar). Esta é uma prévia — a arte final aparece em “Como vai ficar” depois de salvar.
            {formato === "STORY" && " As faixas escuras são a área dos botões do Instagram."}
          </p>
          {naMargem && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
              <AlertTriangle className="size-3.5" />
              Tem texto na área dos botões do Instagram (faixas escuras).
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border bg-card p-4">
            {!selecao && <p className="text-sm text-muted-foreground">Toque num elemento da arte pra ajustar.</p>}

            {selecao?.tipo === "foto" && (() => {
              const i = selecao.i;
              const f = dados.fotos[i];
              return (
                <>
                  <h2 className="text-sm font-semibold">Foto {dados.fotos.length > 1 ? i + 1 : ""}</h2>
                  <div className="space-y-1.5">
                    <Label>Zoom ({f.zoom.toFixed(2)}×)</Label>
                    <input type="range" min={1} max={3} step={0.05} value={f.zoom} onChange={(e) => trocarFoto(i, { zoom: Number(e.target.value) })} className="w-full accent-primary" />
                  </div>
                  <Button variant="outline" size="sm" onClick={() => trocarFoto(i, { fx: 0.5, fy: 0.5, zoom: 1 })}>
                    <Crosshair className="size-4" />
                    Centralizar
                  </Button>
                  {fotosPost.length > 1 && (
                    <div className="space-y-1.5">
                      <Label>Trocar a foto</Label>
                      <div className="grid grid-cols-5 gap-1.5">
                        {fotosPost.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => trocarFoto(i, { imagemId: p.id, fx: 0.5, fy: 0.5, zoom: 1 })}
                            className={`aspect-square overflow-hidden rounded-md border-2 ${p.id === f.imagemId ? "border-primary" : "border-transparent"}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/api/imagem/postagem-imagem/${p.id}`} alt="" className="size-full object-cover" loading="lazy" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            {elemento?.tipo === "titulo" && (
              <>
                <h2 className="text-sm font-semibold">Título</h2>
                {elemento.linhas.map((l, i) => (
                  <div key={i} className="space-y-1.5">
                    <Label>{elemento.linhas.length > 1 ? (i === 0 ? "Linha pequena" : "Linha grande") : "Texto"}</Label>
                    <Input
                      value={l.t}
                      maxLength={40}
                      onChange={(ev) => trocarElemento(elemento.id, (x) => ({ ...(x as ElementoTitulo), linhas: (x as ElementoTitulo).linhas.map((y, j) => (j === i ? { ...y, t: ev.target.value } : y)) }))}
                      onBlur={(ev) => trocarElemento(elemento.id, (x) => ({ ...(x as ElementoTitulo), linhas: (x as ElementoTitulo).linhas.map((y, j) => (j === i ? { ...y, t: comMaiuscula(ev.target.value) } : y)) }))}
                    />
                  </div>
                ))}
                <div className="space-y-1.5">
                  <Label>Tamanho ({Math.round((elemento.escala || 1) * 100)}%)</Label>
                  <input type="range" min={0.6} max={1.6} step={0.05} value={elemento.escala || 1} onChange={(ev) => trocarElemento(elemento.id, (x) => ({ ...(x as ElementoTitulo), escala: Number(ev.target.value) }))} className="w-full accent-primary" />
                </div>
              </>
            )}

            {elemento?.tipo === "selo" && (
              <>
                <h2 className="text-sm font-semibold">Selo {elemento.estilo === "laranja" ? "laranja" : "branco"}</h2>
                <div className="space-y-1.5">
                  <Label>Texto</Label>
                  <Input
                    value={elemento.t}
                    maxLength={40}
                    onChange={(ev) => trocarElemento(elemento.id, (x) => ({ ...(x as ElementoSelo), t: ev.target.value }))}
                    onBlur={(ev) => trocarElemento(elemento.id, (x) => ({ ...(x as ElementoSelo), t: comMaiuscula(ev.target.value) }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tamanho ({elemento.tam} px)</Label>
                  <input type="range" min={18} max={44} step={1} value={elemento.tam} onChange={(ev) => trocarElemento(elemento.id, (x) => ({ ...(x as ElementoSelo), tam: Number(ev.target.value) }))} className="w-full accent-primary" />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => {
                    setDados((d) => ({ ...d, elementos: d.elementos.filter((x) => x.id !== elemento.id) }));
                    setSelecao(null);
                  }}
                >
                  <Trash2 className="size-4" />
                  Tirar este selo
                </Button>
              </>
            )}

            {elemento?.tipo === "logo" && (
              <>
                <h2 className="text-sm font-semibold">Logo</h2>
                <p className="text-xs text-muted-foreground">A logo só muda de tamanho e de posição.</p>
                <div className="space-y-1.5">
                  <Label>Tamanho ({elemento.larg} px)</Label>
                  <input
                    type="range"
                    min={150}
                    max={600}
                    step={5}
                    value={elemento.larg}
                    onChange={(ev) => {
                      const larg = Number(ev.target.value);
                      trocarElemento(elemento.id, (x) => ({ ...(x as ElementoLogo), larg, cx: Math.round(limitar((x as ElementoLogo).cx, larg / 2, w - larg / 2)) }));
                    }}
                    className="w-full accent-primary"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => trocarElemento(elemento.id, (x) => ({ ...(x as ElementoLogo), cx: w / 2 }))}>
                  <Crosshair className="size-4" />
                  Centralizar
                </Button>
              </>
            )}

            {titulo && selos.length < 2 && (
              <Button variant="outline" size="sm" onClick={adicionarSelo}>
                <Plus className="size-4" />
                Adicionar selo
              </Button>
            )}
            <p className="text-xs text-muted-foreground">No máximo 3 informações por imagem: o título e 2 selos.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button disabled={!alterado || pending} onClick={() => salvar()}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Salvar ajustes
            </Button>
            <Button variant="outline" disabled={!alterado || pending} onClick={() => setDados(salvo)}>
              <RotateCcw className="size-4" />
              Desfazer
            </Button>
            {props.proximaId && (
              <Button variant="ghost" disabled={pending} onClick={() => (alterado ? salvar(() => router.push(`/marketing/${postId}/arte/${props.proximaId}`)) : irPara(props.proximaId))}>
                {alterado ? "Salvar e ir pra próxima" : "Próxima arte"}
                <ChevronRight className="size-4" />
              </Button>
            )}
          </div>
          {props.aprovado && <p className="text-xs text-muted-foreground">Este post está aprovado: salvar um ajuste volta ele pra revisão.</p>}

          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">Como vai ficar (arte final)</h2>
            <a
              href={`/api/imagem/postagem-arte/${arteId}?v=${props.versao}`}
              target="_blank"
              rel="noreferrer"
              className={`relative block w-48 overflow-hidden rounded-lg border bg-muted ${formato === "STORY" ? "aspect-[9/16]" : "aspect-[4/5]"}`}
            >
              {!finalCarregada && (
                <span className="absolute inset-0 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Desenhando...
                </span>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/imagem/postagem-arte/${arteId}?v=${props.versao}`} alt="Arte final" onLoad={() => setFinalCarregada(true)} className="relative size-full object-cover" />
            </a>
            {alterado && <p className="text-xs text-muted-foreground">Salve pra ver os ajustes na arte final.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
