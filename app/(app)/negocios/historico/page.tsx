import Link from "next/link";
import { requireModulo } from "@/lib/auth/guards";
import { getHistoricoNegocios, listFunisComFechamento } from "@/lib/server/negocios-historico";
import type { MesHistorico, NegocioFechado } from "@/lib/utils/historico-negocios";
import { centavosParaReais } from "@/lib/utils/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

// Guia Histórico de Negócios (pedido de 2026-10-01): ganhos e perdidos de cada
// mês, com os negócios. No quadro, Ganho/Perdido mostram só o mês atual.

const PERIODOS = [
  { id: "12", rotulo: "Últimos 12 meses", meses: 12 },
  { id: "tudo", rotulo: "Tudo", meses: null },
] as const;

function pct(valor: number | null): string {
  return valor === null ? "—" : `${Math.round(valor * 100)}%`;
}

function dataCurta(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
}

export default async function HistoricoNegociosPage({ searchParams }: { searchParams: Promise<{ funil?: string; periodo?: string }> }) {
  await requireModulo("negocios");
  const { funil, periodo } = await searchParams;
  const funis = await listFunisComFechamento();
  const funilAtual = funis.find((f) => f.id === funil) ?? funis[0];
  const periodoAtual = PERIODOS.find((p) => p.id === periodo) ?? PERIODOS[0];
  const meses = funilAtual ? await getHistoricoNegocios({ funilId: funilAtual.id, meses: periodoAtual.meses }) : [];

  const total = meses.reduce(
    (acc, m) => ({
      ganhosQtd: acc.ganhosQtd + m.ganhos.qtd,
      ganhosValor: acc.ganhosValor + m.ganhos.valorCentavos,
      perdidosQtd: acc.perdidosQtd + m.perdidos.qtd,
      perdidosValor: acc.perdidosValor + m.perdidos.valorCentavos,
    }),
    { ganhosQtd: 0, ganhosValor: 0, perdidosQtd: 0, perdidosValor: 0 },
  );
  const fechados = total.ganhosQtd + total.perdidosQtd;
  const href = (p: { funil?: string; periodo?: string }) =>
    `/negocios/historico?funil=${p.funil ?? funilAtual?.id ?? ""}&periodo=${p.periodo ?? periodoAtual.id}`;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b bg-card px-6 py-3.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href={funilAtual ? `/negocios?funil=${funilAtual.id}` : "/negocios"} aria-label="Voltar ao quadro">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Histórico de negócios</h1>
            <p className="text-sm text-muted-foreground">
              Ganhos e perdidos de cada mês. No quadro, as colunas Ganho e Perdido mostram só o mês atual — na virada do mês elas ficam vazias e
              os negócios aparecem aqui.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {funis.length > 1 && (
            <div className="flex gap-1">
              {funis.map((f) => (
                <Link
                  key={f.id}
                  href={href({ funil: f.id })}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium",
                    f.id === funilAtual?.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {f.nome}
                </Link>
              ))}
            </div>
          )}
          <div className="flex gap-1">
            {PERIODOS.map((p) => (
              <Link
                key={p.id}
                href={href({ periodo: p.id })}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium",
                  p.id === periodoAtual.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {p.rotulo}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-6 p-6">
        {meses.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum negócio ganho ou perdido no período.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Resumo rotulo="Ganhos" valor={`${total.ganhosQtd} · ${centavosParaReais(total.ganhosValor)}`} classe="text-success" />
              <Resumo rotulo="Perdidos" valor={`${total.perdidosQtd} · ${centavosParaReais(total.perdidosValor)}`} classe="text-destructive" />
              <Resumo rotulo="Conversão" valor={pct(fechados > 0 ? total.ganhosQtd / fechados : null)} />
              <Resumo rotulo="Ticket médio" valor={total.ganhosQtd > 0 ? centavosParaReais(Math.round(total.ganhosValor / total.ganhosQtd)) : "—"} />
            </div>

            <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Mês</th>
                    <th className="px-4 py-2 text-right font-medium">Ganhos</th>
                    <th className="px-4 py-2 text-right font-medium">Perdidos</th>
                    <th className="px-4 py-2 text-right font-medium">Conversão</th>
                    <th className="px-4 py-2 text-right font-medium">Ticket médio</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {meses.map((m) => (
                    <tr key={m.mes} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-2">
                        <a href={`#mes-${m.mes}`} className="font-medium capitalize hover:underline">
                          {m.rotulo}
                        </a>
                        {m.atual && <span className="ml-2 text-xs text-muted-foreground">(mês atual, também no quadro)</span>}
                      </td>
                      <td className="px-4 py-2 text-right text-success">
                        {m.ganhos.qtd} · {centavosParaReais(m.ganhos.valorCentavos)}
                      </td>
                      <td className="px-4 py-2 text-right text-destructive">
                        {m.perdidos.qtd} · {centavosParaReais(m.perdidos.valorCentavos)}
                      </td>
                      <td className="px-4 py-2 text-right">{pct(m.conversao)}</td>
                      <td className="px-4 py-2 text-right">{m.ticketMedioCentavos !== null ? centavosParaReais(m.ticketMedioCentavos) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3">
              {meses.map((m, i) => (
                <MesDetalhe key={m.mes} mes={m} aberto={i < 2} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Resumo({ rotulo, valor, classe }: { rotulo: string; valor: string; classe?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-xs">
      <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
      <p className={cn("text-lg font-bold tabular-nums", classe)}>{valor}</p>
    </div>
  );
}

function MesDetalhe({ mes, aberto }: { mes: MesHistorico; aberto: boolean }) {
  return (
    <details id={`mes-${mes.mes}`} open={aberto} className="scroll-mt-4 rounded-xl border bg-card shadow-xs">
      <summary className="cursor-pointer select-none px-4 py-3">
        <span className="font-semibold capitalize">{mes.rotulo}</span>
        <span className="ml-2 text-sm text-muted-foreground">
          {mes.ganhos.qtd} {mes.ganhos.qtd === 1 ? "ganho" : "ganhos"} · {mes.perdidos.qtd} {mes.perdidos.qtd === 1 ? "perdido" : "perdidos"} ·
          conversão {pct(mes.conversao)}
          {mes.atual ? " · mês atual" : ""}
        </span>
      </summary>
      <div className="grid gap-5 border-t px-4 py-4 lg:grid-cols-2">
        <ListaNegocios titulo="Ganhos" itens={mes.ganhos.itens} total={mes.ganhos.valorCentavos} classeTotal="text-success" />
        <div className="space-y-3">
          <ListaNegocios titulo="Perdidos" itens={mes.perdidos.itens} total={mes.perdidos.valorCentavos} classeTotal="text-destructive" mostrarMotivo />
          {mes.perdidos.motivos.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">Motivos de perda</p>
              <div className="flex flex-wrap gap-1.5">
                {mes.perdidos.motivos.map((m) => (
                  <span key={m.motivo} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {m.motivo} {m.qtd > 1 && <b>×{m.qtd}</b>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

function ListaNegocios({
  titulo,
  itens,
  total,
  classeTotal,
  mostrarMotivo,
}: {
  titulo: string;
  itens: NegocioFechado[];
  total: number;
  classeTotal: string;
  mostrarMotivo?: boolean;
}) {
  return (
    <div>
      <p className="mb-1.5 flex items-baseline justify-between text-sm font-semibold">
        {titulo}
        <span className={cn("tabular-nums", classeTotal)}>{centavosParaReais(total)}</span>
      </p>
      {itens.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {itens.map((n) => (
            <li key={n.id}>
              <Link href={`/negocios/${n.id}`} className="flex items-start justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/50">
                <span className="min-w-0">
                  <span className="block font-medium">{n.titulo}</span>
                  <span className="block text-xs text-muted-foreground">
                    {[n.contatoNome, n.responsavelNome, dataCurta(n.data)].filter(Boolean).join(" · ")}
                  </span>
                  {mostrarMotivo && <span className="block text-xs text-destructive/80">Motivo: {n.motivoPerda?.trim() || "não registrado"}</span>}
                </span>
                <span className="shrink-0 tabular-nums">{centavosParaReais(n.valorCentavos)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
