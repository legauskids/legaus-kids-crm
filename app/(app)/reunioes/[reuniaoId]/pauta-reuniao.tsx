"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, ArrowUpRight, Copy, MessageSquare, Plus, Send, Sparkles, Trash2, Undo2, X } from "lucide-react";
import {
  adicionarItemPautaAction,
  adicionarOpiniaoAction,
  atualizarItemPautaAction,
  excluirItemPautaAction,
  excluirOpiniaoAction,
  moverItemPautaAction,
} from "@/app/(app)/reunioes/actions";

export type ItemPautaVM = {
  id: string;
  titulo: string;
  descricao: string | null;
  origem: "SUGERIDO" | "MANUAL" | "PENDENTE_ANTERIOR";
  link: string | null;
  status: "PENDENTE" | "DISCUTIDO" | "ADIADO";
  decisao: string | null;
  opinioes: { id: string; autorId: string; autorNome: string; texto: string; criadoEm: string }[];
};

const ORIGEM: Record<ItemPautaVM["origem"], { rotulo: string; classe: string }> = {
  SUGERIDO: { rotulo: "Sugerido pelo CRM", classe: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" },
  MANUAL: { rotulo: "Incluído pela equipe", classe: "bg-muted text-muted-foreground" },
  PENDENTE_ANTERIOR: { rotulo: "Veio da reunião anterior", classe: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
};

const STATUS: { valor: ItemPautaVM["status"]; rotulo: string; ativo: string }[] = [
  { valor: "PENDENTE", rotulo: "A discutir", ativo: "bg-muted text-foreground" },
  { valor: "DISCUTIDO", rotulo: "Discutido", ativo: "bg-emerald-600 text-white" },
  { valor: "ADIADO", rotulo: "Adiado", ativo: "bg-amber-500 text-white" },
];

function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function PautaReuniao({
  reuniaoId,
  titulo,
  dataHoraTexto,
  encerrada,
  itens,
  usuarioAtualId,
  isAdmin,
  pautaGeradaEm,
}: {
  reuniaoId: string;
  titulo: string;
  dataHoraTexto: string;
  encerrada: boolean;
  itens: ItemPautaVM[];
  usuarioAtualId: string;
  isAdmin: boolean;
  pautaGeradaEm: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [novoAberto, setNovoAberto] = useState(false);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novaDescricao, setNovaDescricao] = useState("");

  function adicionar() {
    startTransition(async () => {
      const r = await adicionarItemPautaAction(reuniaoId, novoTitulo, novaDescricao, "");
      if (r.error) return void toast.error(r.error);
      setNovoTitulo("");
      setNovaDescricao("");
      setNovoAberto(false);
      router.refresh();
    });
  }

  // Texto pronto pra colar no WhatsApp pedindo a opinião de cada um antes da reunião.
  async function copiarPauta() {
    const linhas = [
      `*Pauta — ${titulo}*`,
      dataHoraTexto,
      "",
      ...itens.flatMap((i, idx) => {
        const pergunta = i.descricao?.split("\n").find((l) => l.startsWith("Pra opinar:"));
        return [`*${idx + 1}. ${i.titulo}*`, ...(pergunta ? [`_${pergunta.replace("Pra opinar:", "").trim()}_`] : []), ""];
      }),
      `Deixe sua opinião em cada item antes da reunião: ${window.location.origin}/reunioes/${reuniaoId}#pauta`,
    ];
    try {
      await navigator.clipboard.writeText(linhas.join("\n"));
      toast.success("Pauta copiada — é só colar no WhatsApp.");
    } catch {
      toast.error("Não consegui copiar — o navegador bloqueou a área de transferência.");
    }
  }

  const discutidos = itens.filter((i) => i.status === "DISCUTIDO").length;

  return (
    <section id="pauta" className="scroll-mt-32 rounded-xl border bg-card p-4 shadow-xs">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">Pauta</h2>
        <span className="text-xs text-muted-foreground">
          {itens.length === 0 ? "vazia" : `${discutidos} de ${itens.length} discutidos`}
          {pautaGeradaEm ? ` · sugestão do CRM em ${quando(pautaGeradaEm)}` : ""}
        </span>
        <div className="ml-auto flex gap-2 print:hidden">
          {itens.length > 0 && (
            <Button size="sm" variant="outline" onClick={copiarPauta}>
              <Copy className="size-3.5" />
              Copiar pro WhatsApp
            </Button>
          )}
          {!encerrada && (
            <Button size="sm" variant="outline" onClick={() => setNovoAberto((v) => !v)}>
              <Plus className="size-3.5" />
              Incluir assunto
            </Button>
          )}
        </div>
      </div>

      {itens.length === 0 && !novoAberto && (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          <Sparkles className="mx-auto mb-1.5 size-5 text-violet-500" />
          Sem itens ainda. Na véspera, clique em <strong>Sugerir pauta com IA</strong>: o CRM cruza os números, os sinais de atenção, os
          compromissos em aberto e a avaliação da reunião anterior e propõe os assuntos, cada um com a pergunta pra equipe opinar.
        </p>
      )}

      {novoAberto && (
        <div className="mb-3 space-y-2 rounded-lg border bg-muted/30 p-3">
          <Input value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)} placeholder="Assunto (ex.: Contratar montador freelancer?)" />
          <Textarea
            value={novaDescricao}
            onChange={(e) => setNovaDescricao(e.target.value)}
            placeholder="Contexto e o que precisa ser decidido (opcional)"
            rows={2}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={adicionar} disabled={pending || !novoTitulo.trim()}>
              Incluir na pauta
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNovoAberto(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <ol className="space-y-3">
        {itens.map((item, idx) => (
          <ItemPauta
            key={`${item.id}-${item.status}-${item.decisao ?? ""}-${item.opinioes.length}`}
            item={item}
            numero={idx + 1}
            primeiro={idx === 0}
            ultimo={idx === itens.length - 1}
            encerrada={encerrada}
            usuarioAtualId={usuarioAtualId}
            isAdmin={isAdmin}
          />
        ))}
      </ol>
    </section>
  );
}

function ItemPauta({
  item,
  numero,
  primeiro,
  ultimo,
  encerrada,
  usuarioAtualId,
  isAdmin,
}: {
  item: ItemPautaVM;
  numero: number;
  primeiro: boolean;
  ultimo: boolean;
  encerrada: boolean;
  usuarioAtualId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [opiniao, setOpiniao] = useState("");
  const [decisao, setDecisao] = useState(item.decisao ?? "");
  const decisaoAlterada = decisao.trim() !== (item.decisao ?? "");

  function executar(fn: () => Promise<{ error?: string }>, depois?: () => void) {
    startTransition(async () => {
      const r = await fn();
      if (r.error) return void toast.error(r.error);
      depois?.();
      router.refresh();
    });
  }

  const linhas = (item.descricao ?? "").split("\n").filter(Boolean);

  return (
    <li
      className={cn(
        "rounded-lg border p-3",
        item.status === "DISCUTIDO" && "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20",
        item.status === "ADIADO" && "border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20",
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{numero}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">{item.titulo}</p>
          <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold", ORIGEM[item.origem].classe)}>
            {ORIGEM[item.origem].rotulo}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1 print:hidden">
          {item.link && (
            <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
              <Link href={item.link}>
                Abrir painel
                <ArrowUpRight className="size-3" />
              </Link>
            </Button>
          )}
          {!encerrada && (
            <>
              <div className="flex overflow-hidden rounded-md border">
                {STATUS.map((s) => (
                  <button
                    key={s.valor}
                    type="button"
                    disabled={pending}
                    onClick={() => executar(() => atualizarItemPautaAction(item.id, { status: s.valor }))}
                    className={cn(
                      "px-2 py-1 text-[11px] font-medium transition-colors",
                      item.status === s.valor ? s.ativo : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {s.rotulo}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={pending || primeiro}
                onClick={() => executar(() => moverItemPautaAction(item.id, "cima"))}
                className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                aria-label="Subir"
              >
                <ArrowUp className="size-3.5" />
              </button>
              <button
                type="button"
                disabled={pending || ultimo}
                onClick={() => executar(() => moverItemPautaAction(item.id, "baixo"))}
                className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                aria-label="Descer"
              >
                <ArrowDown className="size-3.5" />
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (confirm(`Tirar "${item.titulo}" da pauta?`)) executar(() => excluirItemPautaAction(item.id));
                }}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-600"
                aria-label="Tirar da pauta"
              >
                <Trash2 className="size-3.5" />
              </button>
            </>
          )}
          {encerrada && item.status !== "DISCUTIDO" && (
            <span className="text-[11px] font-medium text-amber-700">{item.status === "ADIADO" ? "Adiado" : "Não discutido"}</span>
          )}
        </div>
      </div>

      {linhas.length > 0 && (
        <div className="mt-2 space-y-1 pl-8 text-sm text-muted-foreground">
          {linhas.map((l, i) =>
            l.startsWith("Pra opinar:") ? (
              <p key={i} className="flex gap-1.5 font-medium text-violet-700 dark:text-violet-300">
                <MessageSquare className="mt-0.5 size-3.5 shrink-0" />
                {l.replace("Pra opinar:", "").trim()}
              </p>
            ) : (
              <p key={i}>{l}</p>
            ),
          )}
        </div>
      )}

      <div className="mt-2.5 space-y-1.5 pl-8">
        {item.opinioes.map((o) => (
          <div key={o.id} className="group flex items-start gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm">
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{o.autorNome}:</span> {o.texto}
              <span className="ml-1.5 text-[11px] text-muted-foreground">{quando(o.criadoEm)}</span>
            </span>
            {!encerrada && (o.autorId === usuarioAtualId || isAdmin) && (
              <button
                type="button"
                onClick={() => executar(() => excluirOpiniaoAction(o.id))}
                className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-red-600 group-hover:opacity-100 print:hidden"
                aria-label="Apagar opinião"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        ))}
        {!encerrada && (
          <form
            className="flex gap-2 print:hidden"
            onSubmit={(e) => {
              e.preventDefault();
              if (opiniao.trim()) executar(() => adicionarOpiniaoAction(item.id, opiniao), () => setOpiniao(""));
            }}
          >
            <Input value={opiniao} onChange={(e) => setOpiniao(e.target.value)} placeholder="Sua opinião sobre este assunto..." className="h-8 text-sm" />
            <Button type="submit" size="sm" variant="ghost" className="h-8" disabled={pending || !opiniao.trim()} aria-label="Enviar opinião">
              <Send className="size-3.5" />
            </Button>
          </form>
        )}

        {encerrada ? (
          item.decisao && (
            <p className="rounded-md border-l-4 border-l-emerald-500 bg-emerald-50/60 px-2.5 py-1.5 text-sm dark:bg-emerald-950/30">
              <span className="font-semibold">Decisão:</span> {item.decisao}
            </p>
          )
        ) : (
          <div className="space-y-1.5">
            <Textarea
              value={decisao}
              onChange={(e) => setDecisao(e.target.value)}
              placeholder="O que ficou decidido (se virar ação, registre também em Compromissos: o quê, quem, quando)"
              rows={decisao ? 2 : 1}
              className="min-h-8 text-sm"
            />
            {decisaoAlterada && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={pending}
                  onClick={() =>
                    executar(() =>
                      atualizarItemPautaAction(item.id, {
                        decisao,
                        ...(decisao.trim() && item.status === "PENDENTE" ? { status: "DISCUTIDO" as const } : {}),
                      }),
                    )
                  }
                >
                  Salvar decisão
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDecisao(item.decisao ?? "")}>
                  <Undo2 className="size-3" />
                  Desfazer
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
