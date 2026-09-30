"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, History, Pencil, Plus } from "lucide-react";
import {
  alternarAtivoCompromissoAction,
  criarCompromissoAction,
  moverCompromissoAction,
  salvarCompromissoAction,
} from "@/app/(app)/configuracoes/actions";

type Frequencia = "DIARIA" | "SEMANAL";
type Regra = "CATEGORIA" | "PLANEJAR_DIA_SEGUINTE";

export type VersaoVM = { vigenteDesde: string; meta: number | null; diasUteis: number[]; horarioCorte: string | null };

export type CompromissoConfigVM = {
  id: string;
  nome: string;
  frequencia: Frequencia;
  regra: Regra;
  categoriaId: string | null;
  categoriaNome: string | null;
  categoriaCor: string | null;
  metaDeId: string | null;
  metaDeNome: string | null;
  /** Meta vigente hoje do compromisso espelhado (PLANEJAR_DIA_SEGUINTE). */
  metaEspelhadaAtual: number | null;
  ativo: boolean;
  usuarioIds: string[];
  usuarioNomes: string[];
  atual: VersaoVM | null;
  historico: VersaoVM[];
};

type Opcao = { id: string; nome: string };

// Seg..Dom na ordem da semana (0 = domingo no banco).
const DIAS = [
  { valor: 1, rotulo: "Seg" },
  { valor: 2, rotulo: "Ter" },
  { valor: 3, rotulo: "Qua" },
  { valor: 4, rotulo: "Qui" },
  { valor: 5, rotulo: "Sex" },
  { valor: 6, rotulo: "Sáb" },
  { valor: 0, rotulo: "Dom" },
];

function textoDias(dias: number[]): string {
  const chave = [...dias].sort().join(",");
  if (chave === "1,2,3,4,5") return "seg a sex";
  if (chave === "0,1,2,3,4,5,6") return "todos os dias";
  return DIAS.filter((d) => dias.includes(d.valor)).map((d) => d.rotulo.toLowerCase()).join(", ");
}

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function descricaoRegra(c: CompromissoConfigVM): string {
  if (c.regra === "PLANEJAR_DIA_SEGUINTE") {
    const qtd = c.metaDeId ? `a meta de ${c.metaDeNome} (hoje ${c.metaEspelhadaAtual ?? "?"})` : `${c.atual?.meta ?? "?"}`;
    return `Até ${c.atual?.horarioCorte ?? "?"}, ter tarefas "${c.categoriaNome}" agendadas para o próximo dia útil — quantidade: ${qtd}`;
  }
  const meta = c.atual?.meta ?? "?";
  return `${meta} ${meta === 1 ? "tarefa concluída" : "tarefas concluídas"} de "${c.categoriaNome}" por ${c.frequencia === "DIARIA" ? "dia" : "semana"}`;
}

/**
 * Compromissos: metas recorrentes medidas pelas tarefas concluídas. Meta, dias e
 * horário de corte têm histórico — mudar vale do período atual em diante.
 */
export function CompromissosTab({
  compromissos,
  categorias,
  usuarios,
  diariosPorCategoria,
}: {
  compromissos: CompromissoConfigVM[];
  categorias: Opcao[];
  usuarios: Opcao[];
  /** Compromissos diários por categoria — pra "Planejar o dia seguinte" acompanhar a meta de um deles. */
  diariosPorCategoria: Opcao[];
}) {
  const [novoAberto, setNovoAberto] = useState(false);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-sm font-semibold">Compromissos</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Cada compromisso conta as tarefas concluídas (pelo responsável, no dia da conclusão) da categoria escolhida. Mudar a meta, os
              dias ou o horário vale a partir de hoje (diários) ou desta semana (semanais); os períodos anteriores continuam com a meta da
              época.
            </p>
          </div>
          {!novoAberto && (
            <Button size="sm" onClick={() => setNovoAberto(true)}>
              <Plus className="size-3.5" />
              Novo compromisso
            </Button>
          )}
        </CardHeader>
        {novoAberto && (
          <CardContent>
            <FormularioCompromisso
              categorias={categorias}
              usuarios={usuarios}
              diariosPorCategoria={diariosPorCategoria}
              onFechar={() => setNovoAberto(false)}
            />
          </CardContent>
        )}
      </Card>

      <div className="space-y-3">
        {compromissos.map((c, indice) => (
          <LinhaCompromisso
            key={`${c.id}-${c.nome}-${c.ativo}-${JSON.stringify(c.atual)}-${c.usuarioIds.join(",")}-${c.categoriaId}-${c.metaDeId}`}
            compromisso={c}
            primeiro={indice === 0}
            ultimo={indice === compromissos.length - 1}
            categorias={categorias}
            usuarios={usuarios}
            diariosPorCategoria={diariosPorCategoria}
          />
        ))}
        {compromissos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum compromisso ainda.</p>}
      </div>
    </div>
  );
}

function LinhaCompromisso({
  compromisso: c,
  primeiro,
  ultimo,
  categorias,
  usuarios,
  diariosPorCategoria,
}: {
  compromisso: CompromissoConfigVM;
  primeiro: boolean;
  ultimo: boolean;
  categorias: Opcao[];
  usuarios: Opcao[];
  diariosPorCategoria: Opcao[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [verHistorico, setVerHistorico] = useState(false);

  function executar(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const r = await fn();
      if (r.error) return void toast.error(r.error);
      router.refresh();
    });
  }

  return (
    <Card className={cn(!c.ativo && "opacity-60")}>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex flex-col">
            <button
              type="button"
              disabled={pending || primeiro}
              onClick={() => executar(() => moverCompromissoAction(c.id, "cima"))}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
              aria-label="Subir"
            >
              <ArrowUp className="size-3.5" />
            </button>
            <button
              type="button"
              disabled={pending || ultimo}
              onClick={() => executar(() => moverCompromissoAction(c.id, "baixo"))}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
              aria-label="Descer"
            >
              <ArrowDown className="size-3.5" />
            </button>
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              {c.categoriaCor && <span className="size-2.5 rounded-full" style={{ backgroundColor: c.categoriaCor }} />}
              {c.nome}
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {c.frequencia === "DIARIA" ? "Diário" : "Semanal"}
              </span>
              {!c.ativo && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">Inativo</span>}
            </p>
            <p className="text-sm text-muted-foreground">{descricaoRegra(c)}</p>
            <p className="text-xs text-muted-foreground">
              Dias: {c.atual ? textoDias(c.atual.diasUteis) : "—"} · Pessoas: {c.usuarioNomes.join(", ") || "ninguém"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => setVerHistorico((v) => !v)}>
              <History className="size-3.5" />
              Histórico
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditando((v) => !v)}>
              <Pencil className="size-3.5" />
              Editar
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => executar(() => alternarAtivoCompromissoAction(c.id))}>
              {c.ativo ? "Desativar" : "Reativar"}
            </Button>
          </div>
        </div>

        {verHistorico && (
          <div className="rounded-lg border bg-muted/30 p-3 text-xs">
            <p className="mb-1.5 font-semibold">Histórico da configuração (mais recente primeiro)</p>
            <ul className="space-y-1">
              {c.historico.map((v) => (
                <li key={v.vigenteDesde} className="tabular-nums">
                  Desde {dataCurta(v.vigenteDesde)}: {v.meta !== null ? `meta ${v.meta}` : `meta de ${c.metaDeNome}`} · {textoDias(v.diasUteis)}
                  {v.horarioCorte ? ` · corte ${v.horarioCorte}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {editando && (
          <FormularioCompromisso
            existente={c}
            categorias={categorias}
            usuarios={usuarios}
            diariosPorCategoria={diariosPorCategoria.filter((d) => d.id !== c.id)}
            onFechar={() => setEditando(false)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function FormularioCompromisso({
  existente,
  categorias,
  usuarios,
  diariosPorCategoria,
  onFechar,
}: {
  existente?: CompromissoConfigVM;
  categorias: Opcao[];
  usuarios: Opcao[];
  diariosPorCategoria: Opcao[];
  onFechar: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nome, setNome] = useState(existente?.nome ?? "");
  const [frequencia, setFrequencia] = useState<Frequencia>(existente?.frequencia ?? "DIARIA");
  const [regra, setRegra] = useState<Regra>(existente?.regra ?? "CATEGORIA");
  const [categoriaId, setCategoriaId] = useState(existente?.categoriaId ?? categorias[0]?.id ?? "");
  const [metaDeId, setMetaDeId] = useState(existente?.metaDeId ?? diariosPorCategoria[0]?.id ?? "");
  const [meta, setMeta] = useState(String(existente?.atual?.meta ?? 1));
  const [horarioCorte, setHorarioCorte] = useState(existente?.atual?.horarioCorte ?? "19:00");
  const [dias, setDias] = useState<number[]>(existente?.atual?.diasUteis ?? [1, 2, 3, 4, 5]);
  const [usuarioIds, setUsuarioIds] = useState<string[]>(existente?.usuarioIds ?? usuarios.slice(0, 1).map((u) => u.id));
  const planejar = regra === "PLANEJAR_DIA_SEGUINTE";
  const usaMetaDeOutro = planejar && !!metaDeId;

  function alternar<T>(lista: T[], valor: T): T[] {
    return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
  }

  function salvar() {
    const parametros = {
      meta: usaMetaDeOutro ? null : Number(meta),
      diasUteis: dias,
      horarioCorte: planejar ? horarioCorte : null,
    };
    startTransition(async () => {
      let r: { error?: string };
      if (!existente) {
        r = await criarCompromissoAction({
          nome,
          frequencia: planejar ? "DIARIA" : frequencia,
          regra,
          categoriaId,
          metaDeId: planejar ? metaDeId || null : null,
          usuarioIds,
          ...parametros,
        });
      } else {
        const dadosMudaram =
          nome !== existente.nome ||
          categoriaId !== existente.categoriaId ||
          (planejar && (metaDeId || null) !== existente.metaDeId) ||
          [...usuarioIds].sort().join() !== [...existente.usuarioIds].sort().join();
        const a = existente.atual;
        const parametrosMudaram =
          !a ||
          parametros.meta !== a.meta ||
          [...parametros.diasUteis].sort().join() !== [...a.diasUteis].sort().join() ||
          parametros.horarioCorte !== a.horarioCorte;
        if (!dadosMudaram && !parametrosMudaram) return void onFechar();
        r = await salvarCompromissoAction(
          existente.id,
          dadosMudaram ? { nome, categoriaId, metaDeId: planejar ? metaDeId || null : null, usuarioIds } : null,
          parametrosMudaram ? parametros : null,
        );
      }
      if (r.error) return void toast.error(r.error);
      toast.success(existente ? "Compromisso salvo." : "Compromisso criado.");
      onFechar();
      router.refresh();
    });
  }

  const idBase = existente?.id ?? "novo";

  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idBase}-nome`}>Nome</Label>
          <Input id={`${idBase}-nome`} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Pós-venda ativo" />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idBase}-categoria`}>Categoria de tarefa que conta</Label>
          <select
            id={`${idBase}-categoria`}
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!existente ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${idBase}-regra`}>Regra</Label>
            <select
              id={`${idBase}-regra`}
              value={regra}
              onChange={(e) => setRegra(e.target.value as Regra)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="CATEGORIA">Contar tarefas concluídas da categoria</option>
              <option value="PLANEJAR_DIA_SEGUINTE">Planejar o dia seguinte (tarefas agendadas até o horário de corte)</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idBase}-frequencia`}>Frequência</Label>
            <select
              id={`${idBase}-frequencia`}
              value={planejar ? "DIARIA" : frequencia}
              disabled={planejar}
              onChange={(e) => setFrequencia(e.target.value as Frequencia)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="DIARIA">Diária</option>
              <option value="SEMANAL">Semanal (segunda a domingo)</option>
            </select>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Frequência e regra não mudam depois de criado (mudariam o histórico) — para outra regra, crie um compromisso novo e desative este.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {planejar && (
          <div className="space-y-2">
            <Label htmlFor={`${idBase}-metade`}>Quantidade exigida</Label>
            <select
              id={`${idBase}-metade`}
              value={metaDeId}
              onChange={(e) => setMetaDeId(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {diariosPorCategoria.map((d) => (
                <option key={d.id} value={d.id}>
                  Acompanhar a meta de {d.nome}
                </option>
              ))}
              <option value="">Número fixo</option>
            </select>
          </div>
        )}
        {!usaMetaDeOutro && (
          <div className="space-y-2">
            <Label htmlFor={`${idBase}-meta`}>Meta ({planejar || frequencia === "DIARIA" ? "por dia" : "por semana"})</Label>
            <Input id={`${idBase}-meta`} type="number" min={1} step={1} value={meta} onChange={(e) => setMeta(e.target.value)} className="w-32" />
          </div>
        )}
        {planejar && (
          <div className="space-y-2">
            <Label htmlFor={`${idBase}-corte`}>Horário de corte</Label>
            <Input id={`${idBase}-corte`} type="time" value={horarioCorte} onChange={(e) => setHorarioCorte(e.target.value)} className="w-32" />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Dias considerados</Label>
        <div className="flex flex-wrap gap-1.5">
          {DIAS.map((d) => (
            <button
              key={d.valor}
              type="button"
              onClick={() => setDias((atual) => alternar(atual, d.valor))}
              aria-pressed={dias.includes(d.valor)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                dias.includes(d.valor) ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {d.rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Pessoas</Label>
        <div className="flex flex-wrap gap-3">
          {usuarios.map((u) => (
            <label key={u.id} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={usuarioIds.includes(u.id)}
                onChange={() => setUsuarioIds((atual) => alternar(atual, u.id))}
                className="size-4 accent-primary"
              />
              {u.nome}
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={salvar} disabled={pending || !nome.trim()}>
          {existente ? "Salvar" : "Criar compromisso"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onFechar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
