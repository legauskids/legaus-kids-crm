"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ArrowLeft, CheckCheck, Pencil, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import {
  atualizarReuniaoAction,
  encerrarReuniaoAction,
  excluirReuniaoAction,
  gerarPautaAction,
  reabrirReuniaoAction,
} from "@/app/(app)/reunioes/actions";

export type CabecalhoReuniaoVM = {
  id: string;
  titulo: string;
  tipo: "SEMANAL" | "MENSAL";
  status: "AGENDADA" | "ENCERRADA";
  /** "AAAA-MM-DDTHH:mm" em Brasília, pro input */
  dataHoraInput: string;
  dataHoraTexto: string;
  periodoRotulo: string;
  proximoRotulo: string;
  pautaGeradaEm: string | null;
  itensPendentes: number;
};

const SECOES = [
  { href: "#numeros", label: "Números" },
  { href: "#pauta", label: "Pauta" },
  { href: "#compromissos", label: "Compromissos" },
  { href: "#ata", label: "Ata e avaliação" },
];

export function CabecalhoReuniao({ reuniao }: { reuniao: CabecalhoReuniaoVM }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [acao, setAcao] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState(reuniao.titulo);
  const [dataHora, setDataHora] = useState(reuniao.dataHoraInput);
  const encerrada = reuniao.status === "ENCERRADA";

  function rodar(nome: string, fn: () => Promise<void>) {
    setAcao(nome);
    startTransition(async () => {
      await fn();
      setAcao(null);
    });
  }

  function salvar() {
    rodar("salvar", async () => {
      const r = await atualizarReuniaoAction(reuniao.id, {
        titulo,
        ...(dataHora !== reuniao.dataHoraInput ? { dataHora } : {}),
      });
      if (r.error) return void toast.error(r.error);
      setEditando(false);
      router.refresh();
    });
  }

  function gerarPauta() {
    rodar("pauta", async () => {
      const r = await gerarPautaAction(reuniao.id);
      if (r.error) return void toast.error(r.error);
      toast.success(`Pauta sugerida com ${r.itensCriados} itens. Compartilhe com a equipe pra cada um opinar antes da reunião.`);
      router.refresh();
    });
  }

  function encerrar() {
    const aviso =
      reuniao.itensPendentes > 0
        ? `Ainda há ${reuniao.itensPendentes} item(ns) da pauta sem marcar como discutido ou adiado — eles voltam pra pauta da próxima reunião.\n\n`
        : "";
    if (!confirm(`${aviso}Encerrar a reunião? Os números ficam congelados como foram vistos hoje e o CRM gera a avaliação do que foi tratado.`)) return;
    rodar("encerrar", async () => {
      const r = await encerrarReuniaoAction(reuniao.id);
      if (r.error) return void toast.error(r.error);
      if (r.aviso) toast.warning(r.aviso);
      else toast.success("Reunião encerrada e avaliada.");
      router.refresh();
    });
  }

  function reabrir() {
    rodar("reabrir", async () => {
      const r = await reabrirReuniaoAction(reuniao.id);
      if (r.error) return void toast.error(r.error);
      router.refresh();
    });
  }

  function excluir() {
    if (!confirm("Excluir esta reunião com a pauta e as opiniões? Os compromissos continuam em Tarefas.")) return;
    rodar("excluir", async () => {
      const r = await excluirReuniaoAction(reuniao.id);
      if (r.error) return void toast.error(r.error);
      router.push("/reunioes");
    });
  }

  return (
    <div className="sticky top-0 z-10 border-b bg-card/95 px-6 py-3 shadow-xs backdrop-blur print:static">
      <div className="flex flex-wrap items-start gap-3">
        <Button asChild variant="ghost" size="icon" className="mt-0.5 shrink-0 print:hidden">
          <Link href="/reunioes" aria-label="Voltar pras reuniões">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>

        <div className="min-w-0 flex-1">
          {editando ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="h-9 min-w-64 flex-1" />
              <Input type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} className="h-9 w-52" />
              <Button size="sm" onClick={salvar} disabled={pending || !titulo.trim()}>
                Salvar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight">
              {reuniao.titulo}
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {reuniao.tipo === "SEMANAL" ? "Semanal" : "Mensal"}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  encerrada ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-primary/10 text-primary",
                )}
              >
                {encerrada ? "Encerrada" : "Agendada"}
              </span>
              {!encerrada && (
                <button type="button" onClick={() => setEditando(true)} className="text-muted-foreground hover:text-foreground print:hidden" aria-label="Editar título e data">
                  <Pencil className="size-3.5" />
                </button>
              )}
            </h1>
          )}
          <p className="text-sm text-muted-foreground">
            {reuniao.dataHoraTexto} · analisa <strong className="font-medium text-foreground">{reuniao.periodoRotulo}</strong> · perspectiva{" "}
            <strong className="font-medium text-foreground">{reuniao.proximoRotulo}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {!encerrada ? (
            <>
              <Button size="sm" variant="outline" onClick={gerarPauta} disabled={pending}>
                <Sparkles className="size-3.5" />
                {acao === "pauta" ? "Preparando pauta..." : reuniao.pautaGeradaEm ? "Refazer pauta sugerida" : "Sugerir pauta com IA"}
              </Button>
              <Button size="sm" onClick={encerrar} disabled={pending}>
                <CheckCheck className="size-3.5" />
                {acao === "encerrar" ? "Encerrando e avaliando..." : "Encerrar e avaliar"}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={reabrir} disabled={pending}>
              <RotateCcw className="size-3.5" />
              Reabrir
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={excluir} disabled={pending} aria-label="Excluir reunião" className="text-muted-foreground hover:text-red-600">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <nav className="mt-2 flex gap-1 pl-12 print:hidden">
        {SECOES.map((s) => (
          <a key={s.href} href={s.href} className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            {s.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
