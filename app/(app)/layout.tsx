import { requireUser } from "@/lib/auth/guards";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { CategoriasTarefaProvider } from "@/components/tarefas/categorias-context";
import { listCategoriasTarefa } from "@/lib/server/categorias-tarefa";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  // Categorias de compromisso das tarefas — disponíveis pra qualquer tela via contexto.
  const categorias = await listCategoriasTarefa({ incluirInativas: true });

  return (
    <div className="flex h-screen w-full overflow-hidden print:h-auto print:overflow-visible">
      <Sidebar user={user} />
      <div className="flex flex-1 flex-col overflow-hidden print:overflow-visible">
        <div className="print:hidden">
          <Topbar user={user} />
        </div>
        <main className="flex-1 overflow-auto print:overflow-visible">
          <CategoriasTarefaProvider
            categorias={categorias.map((c) => ({ id: c.id, nome: c.nome, cor: c.cor, campoExtra: c.campoExtra, ativa: c.ativa }))}
          >
            {children}
          </CategoriasTarefaProvider>
        </main>
        <div className="print:hidden">
          <MobileNav user={user} />
        </div>
      </div>
    </div>
  );
}
