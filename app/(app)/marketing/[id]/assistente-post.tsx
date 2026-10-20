"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, SendHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { conversarAction } from "@/app/(app)/marketing/actions";

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

  function enviar(t: string) {
    const pedido = t.trim();
    if (!pedido || pending) return;
    setTexto("");
    setMensagens((m) => [...m, { id: `eu-${Date.now()}`, de: "voce", texto: pedido }]);
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
          placeholder="Ex.: troca a foto da capa por uma em pé e sobe a logo um pouco"
          className="min-h-0 resize-none"
          disabled={pending}
        />
        <Button type="submit" size="icon" disabled={pending || !texto.trim()} aria-label="Enviar">
          <SendHorizontal className="size-4" />
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">Ele não aprova nem publica — isso continua no botão Aprovar.</p>
    </section>
  );
}
