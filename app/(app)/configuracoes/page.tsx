import Link from "next/link";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/lib/auth/guards";
import { listCategoriasTarefa } from "@/lib/server/categorias-tarefa";
import { CategoriasTab } from "@/app/(app)/configuracoes/categorias-tab";

const ABAS = [{ id: "categorias", label: "Categorias de tarefa", href: "/configuracoes?aba=categorias" }] as const;

export default async function ConfiguracoesPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  await requireAdmin();
  const { aba } = await searchParams;
  const abaAtual = ABAS.find((a) => a.id === aba)?.id ?? "categorias";

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
      <div className="flex-1 p-6">{abaAtual === "categorias" && <CategoriasTabData />}</div>
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
