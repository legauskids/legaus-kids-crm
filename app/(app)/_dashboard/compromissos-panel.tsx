"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, Flame } from "lucide-react";
import { ExpandablePanel } from "@/components/shared/expandable-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { corDoIndice } from "@/lib/utils/colors";
import { somarDias } from "@/lib/utils/brasilia";
import { NovaTarefaDialog } from "@/app/(app)/tarefas/nova-tarefa-dialog";
import type { Contagem, ItemPainel, PainelCompromissos } from "@/lib/server/compromissos";

// Card "Compromissos" do Painel (pedido de 2026-09-30): progresso de hoje e da
// semana, sequência de dias cumpridos e, expandido, a grade das últimas 4
// semanas, % de cumprimento, execução do plano e a meta vigente em cada período.
// Cores: cumprido = verde, em andamento = azul claro, não cumprido = vermelho.

const COR_STATUS = {
  cumprido: {
    texto: "text-emerald-700 dark:text-emerald-400",
    barra: "bg-emerald-500",
    fundo: "bg-emerald-500/90 text-white",
    rotulo: "cumprido",
  },
  andamento: {
    texto: "text-sky-700 dark:text-sky-300",
    barra: "bg-sky-400",
    fundo: "bg-sky-200 text-sky-900 dark:bg-sky-900/60 dark:text-sky-100",
    rotulo: "em andamento",
  },
  nao_cumprido: {
    texto: "text-red-700 dark:text-red-400",
    barra: "bg-red-500",
    fundo: "bg-red-500/90 text-white",
    rotulo: "não cumprido",
  },
} as const;

function diaCurto(dia: string): string {
  return new Date(`${dia}T12:00:00-03:00`)
    .toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" })
    .replace(".", "")
    .replace(",", "");
}

function pct(c: Contagem | { planejadas: number; executadas: number }): string {
  const [num, den] = "cumpridos" in c ? [c.cumpridos, c.avaliados] : [c.executadas, c.planejadas];
  return den === 0 ? "—" : `${Math.round((num / den) * 100)}%`;
}

function LinhaItem({ item }: { item: ItemPainel }) {
  const cor = COR_STATUS[item.status];
  const nome = item.regra === "PLANEJAR_DIA_SEGUINTE" && item.diaAlvo ? `Planejar ${diaCurto(item.diaAlvo)}` : item.nome;
  const progresso = item.meta > 0 ? Math.min(100, Math.round((item.realizado / item.meta) * 100)) : 100;
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-1.5">
          {item.categoriaCor && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.categoriaCor }} />}
          <span className="truncate">{nome}</span>
        </span>
        <span className={cn("shrink-0 text-xs font-semibold tabular-nums", cor.texto)} title={cor.rotulo}>
          {item.realizado}/{item.meta}
          {item.status === "cumprido" ? " ✓" : ""}
          {item.regra === "PLANEJAR_DIA_SEGUINTE" && item.status === "andamento" && item.horarioCorte ? ` até ${item.horarioCorte}` : ""}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", cor.barra)} style={{ width: `${progresso}%` }} />
      </div>
    </li>
  );
}

export function CompromissosPanel({
  painel,
  pessoas,
  usuarios,
  negocios,
}: {
  painel: PainelCompromissos;
  /** Pro administrador trocar de pessoa (vazio = sem seletor). */
  pessoas: { id: string; nome: string }[];
  usuarios: { id: string; nome: string }[];
  negocios: { id: string; titulo: string; contatoNome: string }[];
}) {
  const router = useRouter();
  const [planejarAberto, setPlanejarAberto] = useState(false);

  const conteudo = (
    <div className="grid gap-5 md:grid-cols-[1fr_1fr_auto]">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hoje · {diaCurto(painel.hoje.dia)}</h3>
        {painel.hoje.itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum compromisso diário hoje.</p>
        ) : (
          <ul className="space-y-2.5">
            {painel.hoje.itens.map((i) => (
              <LinhaItem key={i.compromissoId} item={i} />
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Semana · {diaCurto(painel.semana.inicio).slice(-5)} a {diaCurto(painel.semana.fim).slice(-5)}
        </h3>
        {painel.semana.itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum compromisso semanal.</p>
        ) : (
          <ul className="space-y-2.5">
            {painel.semana.itens.map((i) => (
              <LinhaItem key={i.compromissoId} item={i} />
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-3 md:w-44">
        <div className="rounded-lg border bg-muted/30 px-3 py-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Flame className="size-3.5 text-amber-500" />
            Sequência
          </p>
          <p className="text-2xl font-bold tabular-nums">{painel.sequencia}</p>
          <p className="text-xs text-muted-foreground">{painel.sequencia === 1 ? "dia útil" : "dias úteis"} com todos os diários cumpridos</p>
        </div>
        {painel.planejar && (
          <Button size="sm" variant="outline" onClick={() => setPlanejarAberto(true)}>
            <CalendarPlus className="size-3.5" />
            {painel.planejar.diaAlvo === somarDias(painel.hoje.dia, 1) ? "Planejar amanhã" : `Planejar ${diaCurto(painel.planejar.diaAlvo)}`}
          </Button>
        )}
        {pessoas.length > 1 && (
          <div className="flex flex-wrap gap-1 text-xs">
            {pessoas.map((p) => (
              <Link
                key={p.id}
                href={`/?compromissosDe=${p.id}`}
                className={cn(
                  "rounded-md px-2 py-0.5",
                  p.id === painel.usuario.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {p.nome}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  const expandido = (
    <div className="space-y-6">
      {conteudo}
      <GradeQuatroSemanas painel={painel} />
      <div className="grid gap-5 md:grid-cols-2">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Cumprimento</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 font-medium">Compromisso</th>
                <th className="py-1 text-right font-medium">Semana</th>
                <th className="py-1 text-right font-medium">Mês</th>
              </tr>
            </thead>
            <tbody>
              {painel.percentuais.map((p) => (
                <tr key={p.compromissoId} className="border-t">
                  <td className="py-1.5">{p.nome}</td>
                  <td className="py-1.5 text-right tabular-nums" title={`${p.semana.cumpridos} de ${p.semana.avaliados}`}>
                    {pct(p.semana)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums" title={`${p.mes.cumpridos} de ${p.mes.avaliados}`}>
                    {pct(p.mes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground">Dias e semanas encerrados (ou já cumpridos). O que está em andamento não conta contra.</p>
        </section>
        {painel.taxaPlano && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Execução do plano</h3>
            <p className="text-xs text-muted-foreground">Tarefas de Gerar Receita agendadas na véspera (ou antes) e concluídas no dia.</p>
            <div className="flex gap-4 text-sm">
              <span>
                Semana: <b className="tabular-nums">{pct(painel.taxaPlano.semana)}</b>
              </span>
              <span>
                Mês: <b className="tabular-nums">{pct(painel.taxaPlano.mes)}</b>
              </span>
            </div>
            <ul className="space-y-1 text-xs">
              {painel.taxaPlano.dias
                .filter((d) => d.planejadas > 0)
                .slice(-10)
                .reverse()
                .map((d) => (
                  <li key={d.dia} className="flex justify-between tabular-nums">
                    <span>{diaCurto(d.dia)}</span>
                    <span>
                      {d.executadas} de {d.planejadas} ({pct(d)})
                    </span>
                  </li>
                ))}
              {painel.taxaPlano.dias.every((d) => d.planejadas === 0) && <li className="text-muted-foreground">Nenhum dia planejado ainda.</li>}
            </ul>
          </section>
        )}
      </div>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Meta vigente em cada período</h3>
        <ul className="grid gap-2 text-xs sm:grid-cols-2">
          {painel.metas.map((m) => (
            <li key={m.compromissoId} className="rounded-md border px-3 py-2">
              <p className="font-medium">{m.nome}</p>
              {m.versoes.map((v) => (
                <p key={v.vigenteDesde} className="text-muted-foreground tabular-nums">
                  desde {new Date(v.vigenteDesde).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}:{" "}
                  {v.meta !== null ? `${v.meta} por ${m.frequencia === "DIARIA" ? "dia" : "semana"}` : `meta de ${v.metaDeNome}`}
                  {v.horarioCorte ? `, até ${v.horarioCorte}` : ""}
                </p>
              ))}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );

  return (
    <>
      <ExpandablePanel
        title={`Compromissos${pessoas.length > 1 ? ` · ${painel.usuario.nome}` : ""}`}
        cor={corDoIndice(2)}
        expandedChildren={expandido}
      >
        {conteudo}
      </ExpandablePanel>
      {painel.planejar && (
        <NovaTarefaDialog
          key={planejarAberto ? "planejar-aberto" : "planejar-fechado"}
          open={planejarAberto}
          onOpenChange={(open) => {
            setPlanejarAberto(open);
            if (!open) router.refresh();
          }}
          usuarios={usuarios}
          negocios={negocios}
          valoresIniciais={{
            categoriaId: painel.planejar.categoriaId,
            prazo: `${painel.planejar.diaAlvo}T09:00`,
            responsavelId: painel.usuario.id,
          }}
        />
      )}
    </>
  );
}

function GradeQuatroSemanas({ painel }: { painel: PainelCompromissos }) {
  const semanas: PainelCompromissos["grade"][] = [];
  for (let i = 0; i < painel.grade.length; i += 7) semanas.push(painel.grade.slice(i, i + 7));
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Últimas 4 semanas (compromissos diários)</h3>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
          <span key={d} className="font-medium text-muted-foreground">
            {d}
          </span>
        ))}
        {semanas.flat().map((g) => {
          const titulo =
            g.itens.length > 0 ? `${diaCurto(g.dia)}: ${g.itens.map((i) => `${i.nome} ${i.realizado}/${i.meta}`).join(" · ")}` : diaCurto(g.dia);
          return (
            <div
              key={g.dia}
              title={titulo}
              className={cn(
                "flex h-9 items-center justify-center rounded-md tabular-nums",
                g.estado === "cumprido" && COR_STATUS.cumprido.fundo,
                g.estado === "andamento" && COR_STATUS.andamento.fundo,
                g.estado === "nao_cumprido" && COR_STATUS.nao_cumprido.fundo,
                g.estado === "sem" && "bg-muted/60 text-muted-foreground",
                g.estado === "futuro" && "border border-dashed text-muted-foreground/60",
              )}
            >
              {Number(g.dia.slice(8))}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm bg-emerald-500" /> todos cumpridos
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm bg-sky-300" /> em andamento
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm bg-red-500" /> não cumprido
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm bg-muted" /> sem compromisso
        </span>
      </div>
    </section>
  );
}
