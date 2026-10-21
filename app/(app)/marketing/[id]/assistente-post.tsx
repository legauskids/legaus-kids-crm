"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Mic, SendHorizontal, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { conversarAction, transcreverAudioAction } from "@/app/(app)/marketing/actions";

export type MensagemAssistente = { id: string; de: "voce" | "claude"; texto: string };

/**
 * O Claude dentro do post (pedido do Marcos de 2026-10-20): conversa, olha
 * as artes e faz os ajustes pedidos. Quando ele mexe em algo, a tela
 * recarrega as artes e a legenda.
 */
export function AssistentePost({ postId, historico, temLegenda }: { postId: string; historico: MensagemAssistente[]; temLegenda: boolean }) {
  const router = useRouter();
  const [mensagens, setMensagens] = useState(historico);
  const [texto, setTexto] = useState("");
  const [pending, startTransition] = useTransition();
  const lista = useRef<HTMLDivElement>(null);

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: "smooth" });
  }, [mensagens, pending]);

  const sugestoes = [
    "Olha a capa e me diz o que dá pra melhorar",
    "Desce um pouco o título",
    "Aumenta a logo em todas as artes",
    ...(temLegenda ? ["Deixa a legenda mais curta"] : []),
  ];

  // Comando de voz (pedido do Marcos de 2026-10-21): grava no navegador,
  // transcreve no servidor (mesmo transcritor dos áudios do agente) e manda
  // o texto como pedido.
  const [gravando, setGravando] = useState(false);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const [segundosGravados, setSegundosGravados] = useState(0);
  const gravador = useRef<MediaRecorder | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const limite = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      // Saiu da tela gravando: solta o microfone.
      if (limite.current) clearTimeout(limite.current);
      if (relogio.current) clearInterval(relogio.current);
      gravador.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function comecarGravacao() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Este navegador não grava áudio — escreva o pedido.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipo = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
      pedacos.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) pedacos.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void transcreverEEnviar(rec.mimeType || tipo || "audio/webm");
      };
      rec.start();
      gravador.current = rec;
      setGravando(true);
      setSegundosGravados(0);
      relogio.current = setInterval(() => setSegundosGravados((n) => n + 1), 1000);
      // No máximo 1 minuto por pedido.
      limite.current = setTimeout(pararGravacao, 60_000);
    } catch {
      toast.error("Sem acesso ao microfone — libere o microfone pro CRM nas permissões do navegador.");
    }
  }

  function pararGravacao() {
    if (limite.current) clearTimeout(limite.current);
    if (relogio.current) clearInterval(relogio.current);
    setGravando(false);
    if (gravador.current?.state === "recording") gravador.current.stop();
  }

  async function transcreverEEnviar(mime: string) {
    const audio = new Blob(pedacos.current, { type: mime });
    if (audio.size < 1500) return; // toque sem querer
    setTranscrevendo(true);
    const fd = new FormData();
    fd.append("audio", audio, `voz.${mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm"}`);
    const r = await transcreverAudioAction(fd);
    setTranscrevendo(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    enviar(r.texto, true);
  }

  function enviar(t: string, porVoz = false) {
    const pedido = t.trim();
    if (!pedido || pending) return;
    if (!porVoz) setTexto("");
    setMensagens((m) => [...m, { id: `eu-${Date.now()}`, de: "voce", texto: porVoz ? `🎤 ${pedido}` : pedido }]);
    startTransition(async () => {
      const r = await conversarAction(postId, pedido);
      if (!r.ok) {
        toast.error(r.error);
        setMensagens((m) => [...m, { id: `erro-${Date.now()}`, de: "claude", texto: r.error }]);
        return;
      }
      setMensagens((m) => [...m, { id: `claude-${Date.now()}`, de: "claude", texto: r.resposta }]);
      if (r.mudou) router.refresh();
    });
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Conversar com o Claude</h2>
        <span className="text-xs text-muted-foreground">— ele olha as artes e faz os ajustes que você pedir</span>
      </div>

      <div ref={lista} className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {mensagens.length === 0 && !pending && (
          <div className="flex flex-wrap gap-1.5">
            {sugestoes.map((s) => (
              <button key={s} type="button" onClick={() => enviar(s)} className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                {s}
              </button>
            ))}
          </div>
        )}
        {mensagens.map((m) => (
          <div key={m.id} className={m.de === "voce" ? "flex justify-end" : "flex justify-start"}>
            <p
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                m.de === "voce" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted text-foreground"
              }`}
            >
              {m.texto}
            </p>
          </div>
        ))}
        {pending && (
          <div className="flex justify-start">
            <p className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Olhando as artes e ajustando...
            </p>
          </div>
        )}
      </div>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
        }}
      >
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar(texto);
            }
          }}
          rows={2}
          placeholder={gravando ? "Gravando… toque no botão vermelho quando terminar" : "Ex.: troca a foto da capa por uma em pé e sobe a logo um pouco"}
          className="min-h-0 resize-none"
          disabled={pending || gravando || transcrevendo}
        />
        {gravando ? (
          <Button type="button" size="icon" variant="destructive" onClick={pararGravacao} aria-label="Parar e enviar" className="animate-pulse">
            <Square className="size-4 fill-current" />
          </Button>
        ) : (
          <Button type="button" size="icon" variant="outline" onClick={comecarGravacao} disabled={pending || transcrevendo} aria-label="Falar o pedido" title="Falar o pedido">
            {transcrevendo ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4" />}
          </Button>
        )}
        <Button type="submit" size="icon" disabled={pending || gravando || !texto.trim()} aria-label="Enviar">
          <SendHorizontal className="size-4" />
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        {gravando
          ? `🎙️ Gravando ${segundosGravados}s — fale o pedido e toque no botão vermelho (até 1 minuto).`
          : transcrevendo
            ? "Entendendo o áudio..."
            : "Escreva ou toque no microfone e fale. Ele não aprova nem publica — isso continua no botão Aprovar."}
      </p>
    </section>
  );
}
