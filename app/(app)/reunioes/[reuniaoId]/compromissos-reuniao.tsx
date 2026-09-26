"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Plus } from "lucide-react";
import { alternarCompromissoAction, criarCompromissoAction } from "@/app/(app)/reunioes/actions";

export type CompromissoVM = {
  id: string;
  titulo: string;
  responsavelNome: string;
  prazo: string;
  concluido: boolean;
  atrasado: boolean;
  reuniaoId: string | null;
  reuniaoTitulo: string | null;
};

function dia(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" });
}

/**
 * Compromissos = tarefas com vínculo à reunião: o quê (título), quem
 * (responsável) e quando (prazo). Aparecem também no quadro de Tarefas e
 * nos alertas do dashboard; os de reuniões anteriores ficam aqui pra cobrar.
 */
export function CompromissosReuniao({
  reuniaoId,
  encerrada,
  compromissos,
  anteriores,
  usuarios,
  usuarioAtualId,
  prazoPadrao,
}: {
  reuniaoId: string;
  encerrada: boolean;
  compromissos: CompromissoVM[];
  anteriores: CompromissoVM[];
  usuarios: { id: string; nome: string }[];
  usuarioAtualId: string;
  /** "AAAA-MM-DD" */
  prazoPadrao: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [oQue, setOQue] = useState("");
  const [quem, setQuem] = useState(usuarioAtualId);
  const [quando, setQuando] = useState(prazoPadrao);

  function registrar() {
    startTransition(async () => {
      const r = await criarCompromissoAction(reuniaoId, { titulo: oQue, responsavelId: quem, prazo: quando });
      if (r.error) return void toast.error(r.error);
      setOQue("");
      router.refresh();
    });
  }

  function alternar(c: CompromissoVM) {
    startTransition(async () => {
      const r = await alternarCompromissoAction(c.id, reuniaoId);
      if (r.error) return void toast.error(r.error);
      router.refresh();
    });
  }

  return (
    <section id="compromissos" className="scroll-mt-32 space-y-4 rounded-xl border bg-card p-4 shadow-xs">
      <div>
        <h2 className="text-base font-semibold">Compromissos firmados</h2>
        <p className="text-xs text-muted-foreground">O quê, quem e até quando — viram tarefas e voltam pra próxima reunião até serem cumpridos.</p>
      </div>

      {!encerrada && (
        <form
          className="flex flex-wrap items-center gap-2 print:hidden"
          onSubmit={(e) => {
            e.preventDefault();
            if (oQue.trim()) registrar();
          }}
        >
          <Input value={oQue} onChange={(e) => setOQue(e.target.value)} placeholder="O quê (ex.: Mandar proposta revisada pro Parque X)" className="h-9 min-w-64 flex-1" />
          <select value={quem} onChange={(e) => setQuem(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="Quem">
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
          <Input type="date" value={quando} onChange={(e) => setQuando(e.target.value)} className="h-9 w-40" aria-label="Até quando" />
          <Button type="submit" size="sm" disabled={pending || !oQue.trim() || !quando}>
            <Plus className="size-3.5" />
            Registrar
          </Button>
        </form>
      )}

      <ListaCompromissos itens={compromissos} vazio="Nenhum compromisso registrado nesta reunião." onAlternar={alternar} pending={pending} />

      {anteriores.length > 0 && (
        <div className="space-y-2 border-t pt-3">
          <h3 className="text-sm font-semibold">Em aberto de reuniões anteriores</h3>
          <ListaCompromissos itens={anteriores} vazio="" onAlternar={alternar} pending={pending} mostrarReuniao />
        </div>
      )}
    </section>
  );
}

function ListaCompromissos({
  itens,
  vazio,
  onAlternar,
  pending,
  mostrarReuniao,
}: {
  itens: CompromissoVM[];
  vazio: string;
  onAlternar: (c: CompromissoVM) => void;
  pending: boolean;
  mostrarReuniao?: boolean;
}) {
  if (itens.length === 0) return vazio ? <p className="text-sm text-muted-foreground">{vazio}</p> : null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="w-8 py-1.5" />
            <th className="py-1.5 font-medium">O quê</th>
            <th className="py-1.5 font-medium">Quem</th>
            <th className="py-1.5 font-medium">Quando</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((c) => (
            <tr key={c.id} className="border-b last:border-0">
              <td className="py-2 align-top">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onAlternar(c)}
                  aria-label={c.concluido ? "Reabrir compromisso" : "Marcar como cumprido"}
                  className="text-muted-foreground hover:text-emerald-600 print:hidden"
                >
                  {c.concluido ? <CheckCircle2 className="size-4.5 text-emerald-600" /> : <Circle className="size-4.5" />}
                </button>
              </td>
              <td className={cn("py-2 pr-3 align-top", c.concluido && "text-muted-foreground line-through")}>
                {c.titulo}
                {mostrarReuniao && c.reuniaoId && (
                  <Link href={`/reunioes/${c.reuniaoId}`} className="block text-[11px] text-muted-foreground no-underline hover:underline">
                    {c.reuniaoTitulo}
                  </Link>
                )}
              </td>
              <td className="py-2 pr-3 align-top whitespace-nowrap">{c.responsavelNome}</td>
              <td className={cn("py-2 align-top whitespace-nowrap", c.atrasado && !c.concluido && "font-semibold text-red-600")}>
                {dia(c.prazo)}
                {c.atrasado && !c.concluido ? " · atrasado" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
