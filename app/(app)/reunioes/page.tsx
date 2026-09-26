import Link from "next/link";
import { requireModulo } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { listReunioes } from "@/lib/server/reunioes";
import { diaBrasilia, rotuloPeriodo } from "@/lib/utils/reuniao";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CalendarCheck, CheckCircle2, ChevronRight, Sparkles } from "lucide-react";
import { NovaReuniaoForm } from "@/app/(app)/reunioes/nova-reuniao-form";

function dataHora(d: Date): string {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function ReunioesPage() {
  await requireModulo("reunioes");
  const [reunioes, compromissosAbertos] = await Promise.all([
    listReunioes(),
    prisma.tarefa.findMany({
      where: { reuniaoId: { not: null }, status: { not: "CONCLUIDA" } },
      orderBy: { prazo: "asc" },
      take: 12,
      include: { responsavel: { select: { nome: true } }, reuniao: { select: { id: true, titulo: true } } },
    }),
  ]);
  const agendadas = reunioes.filter((r) => r.status === "AGENDADA").sort((a, b) => a.data.getTime() - b.data.getTime());
  const encerradas = reunioes.filter((r) => r.status === "ENCERRADA");
  const agora = new Date();
  const amanha = diaBrasilia(new Date(agora.getTime() + 24 * 60 * 60 * 1000));

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b bg-card px-6 py-3.5 shadow-xs">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Reuniões</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhamento semanal e mensal: resumo do período, perspectiva do próximo, pauta sugerida pelo CRM, opiniões, compromissos e avaliação.
        </p>
      </div>

      <div className="grid flex-1 gap-5 p-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <NovaReuniaoForm dataHoraPadrao={`${amanha}T09:00`} />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <CalendarCheck className="size-4 text-primary" />
                Próximas reuniões
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {agendadas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma reunião marcada. Crie a próxima acima.</p>}
              {agendadas.map((r) => (
                <LinhaReuniao
                  key={r.id}
                  href={`/reunioes/${r.id}`}
                  titulo={r.titulo}
                  quando={dataHora(r.data)}
                  tipo={r.tipo}
                  detalhe={`Analisa ${rotuloPeriodo(r.periodoInicio, r.periodoFim)} · ${r._count.itensPauta} ${r._count.itensPauta === 1 ? "item" : "itens"} na pauta`}
                  selo={r.pautaGeradaEm ? "Pauta sugerida" : r.data < agora ? "Não encerrada" : null}
                />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Reuniões encerradas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {encerradas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma reunião encerrada ainda.</p>}
              {encerradas.map((r) => {
                const feitos = r.compromissos.filter((c) => c.status === "CONCLUIDA").length;
                return (
                  <LinhaReuniao
                    key={r.id}
                    href={`/reunioes/${r.id}`}
                    titulo={r.titulo}
                    quando={dataHora(r.data)}
                    tipo={r.tipo}
                    detalhe={`${r._count.itensPauta} itens · compromissos: ${feitos} de ${r._count.compromissos} cumpridos`}
                    selo={r.avaliacao ? "Avaliada" : null}
                  />
                );
              })}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Compromissos em aberto</CardTitle>
            <p className="text-xs text-muted-foreground">Firmados nas reuniões — também aparecem em Tarefas.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {compromissosAbertos.length === 0 && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-emerald-600" />
                Nada pendente.
              </p>
            )}
            {compromissosAbertos.map((c) => {
              const atrasado = c.prazo < agora;
              return (
                <Link
                  key={c.id}
                  href={`/reunioes/${c.reuniao!.id}#compromissos`}
                  className="block rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted"
                >
                  <p className="font-medium leading-snug">{c.titulo}</p>
                  <p className={cn("text-xs", atrasado ? "font-semibold text-red-600" : "text-muted-foreground")}>
                    {c.responsavel.nome} · até {c.prazo.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    {atrasado ? " · atrasado" : ""}
                  </p>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LinhaReuniao({
  href,
  titulo,
  quando,
  tipo,
  detalhe,
  selo,
}: {
  href: string;
  titulo: string;
  quando: string;
  tipo: "SEMANAL" | "MENSAL";
  detalhe: string;
  selo: string | null;
}) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {titulo}
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {tipo === "SEMANAL" ? "Semanal" : "Mensal"}
          </span>
          {selo && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {selo === "Pauta sugerida" && <Sparkles className="size-3" />}
              {selo}
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {quando} · {detalhe}
        </p>
      </div>
      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
