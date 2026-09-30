import Link from "next/link";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/lib/auth/guards";
import { listCategoriasTarefa } from "@/lib/server/categorias-tarefa";
import { CategoriasTab } from "@/app/(app)/configuracoes/categorias-tab";
import { CompromissosTab } from "@/app/(app)/configuracoes/compromissos-tab";
import { listCompromissosConfig } from "@/lib/server/compromissos-config";
import { inicioDoPeriodo, versaoVigente } from "@/lib/utils/compromissos";
import { prisma } from "@/lib/db";

const ABAS = [
  { id: "compromissos", label: "Compromissos", href: "/configuracoes?aba=compromissos" },
  { id: "categorias", label: "Categorias de tarefa", href: "/configuracoes?aba=categorias" },
] as const;

export default async function ConfiguracoesPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  await requireAdmin();
  const { aba } = await searchParams;
  const abaAtual = ABAS.find((a) => a.id === aba)?.id ?? "compromissos";

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b bg-card px-6 py-3.5 shadow-xs">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Categorias de tarefa e compromissos (metas de hábitos de gestão). Só administradores.</p>
        <div className="mt-3 flex flex-wrap gap-1">
          {ABAS.map((a) => (
            <Link
              key={a.id}
              href={a.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                abaAtual === a.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {a.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex-1 p-6">
        {abaAtual === "compromissos" && <CompromissosTabData />}
        {abaAtual === "categorias" && <CategoriasTabData />}
      </div>
    </div>
  );
}

async function CategoriasTabData() {
  const categorias = await listCategoriasTarefa({ incluirInativas: true });
  return (
    <CategoriasTab
      categorias={categorias.map((c) => ({
        id: c.id,
        nome: c.nome,
        cor: c.cor,
        campoExtra: c.campoExtra,
        ativa: c.ativa,
        qtdTarefas: c._count.tarefas,
      }))}
    />
  );
}

async function CompromissosTabData() {
  const [compromissos, categorias, usuarios] = await Promise.all([
    listCompromissosConfig(),
    prisma.categoriaTarefa.findMany({ where: { ativa: true }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
    prisma.user.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  const agora = new Date();
  const vigente = (c: (typeof compromissos)[number]) => versaoVigente(c.versoes, inicioDoPeriodo(c.frequencia, agora)) ?? c.versoes[0] ?? null;
  const porId = new Map(compromissos.map((c) => [c.id, c]));
  const paraVM = (v: { vigenteDesde: Date; meta: number | null; diasUteis: number[]; horarioCorte: string | null }) => ({
    vigenteDesde: v.vigenteDesde.toISOString(),
    meta: v.meta,
    diasUteis: v.diasUteis,
    horarioCorte: v.horarioCorte,
  });

  return (
    <CompromissosTab
      compromissos={compromissos.map((c) => {
        const atual = vigente(c);
        const espelhado = c.metaDeId ? porId.get(c.metaDeId) : undefined;
        return {
          id: c.id,
          nome: c.nome,
          frequencia: c.frequencia,
          regra: c.regra,
          categoriaId: c.categoriaId,
          categoriaNome: c.categoria?.nome ?? null,
          categoriaCor: c.categoria?.cor ?? null,
          metaDeId: c.metaDeId,
          metaDeNome: c.metaDe?.nome ?? null,
          metaEspelhadaAtual: espelhado ? (vigente(espelhado)?.meta ?? null) : null,
          ativo: c.ativo,
          usuarioIds: c.usuarios.map((u) => u.usuario.id),
          usuarioNomes: c.usuarios.map((u) => u.usuario.nome),
          atual: atual ? paraVM(atual) : null,
          historico: c.versoes.map(paraVM),
        };
      })}
      categorias={categorias}
      usuarios={usuarios}
      diariosPorCategoria={compromissos.filter((c) => c.frequencia === "DIARIA" && c.regra === "CATEGORIA").map((c) => ({ id: c.id, nome: c.nome }))}
    />
  );
}
