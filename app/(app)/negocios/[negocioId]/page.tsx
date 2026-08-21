import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { getNegocioDetalhado } from "@/lib/server/negocios";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import { centavosParaReais } from "@/lib/utils/money";
import { EtapaBreadcrumb } from "@/app/(app)/negocios/[negocioId]/etapa-breadcrumb";
import { DadosTab } from "@/app/(app)/negocios/[negocioId]/dados-tab";
import { TarefasTab } from "@/app/(app)/negocios/[negocioId]/tarefas-tab";
import { HistoricoTab } from "@/app/(app)/negocios/[negocioId]/historico-tab";

export default async function NegocioDetalhePage({
  params,
}: {
  params: Promise<{ negocioId: string }>;
}) {
  await requireUser();
  const { negocioId } = await params;
  const negocio = await getNegocioDetalhado(negocioId);
  if (!negocio) notFound();

  const usuarios = await prisma.user.findMany({ orderBy: { nome: "asc" } });
  const isFunilVenda = negocio.funil.nome === "Funil de venda";
  const isFunilPosVenda = negocio.funil.nome === "Funil de pós-venda";

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/negocios">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{negocio.titulo}</h1>
          <p className="text-sm text-muted-foreground">
            {negocio.contato.nome} · {centavosParaReais(negocio.valorCentavos)}
          </p>
        </div>
      </div>

      <EtapaBreadcrumb
        negocioId={negocio.id}
        etapaAtualId={negocio.etapaId}
        etapas={negocio.funil.etapas.map((e) => ({ id: e.id, nome: e.nome, ordem: e.ordem, tipo: e.tipo }))}
        isFunilVenda={isFunilVenda}
        isFunilPosVenda={isFunilPosVenda}
      />

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="tarefas">Tarefas ({negocio.tarefas.length})</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="dados">
          <DadosTab negocio={negocio} usuarios={usuarios} isFunilPosVenda={isFunilPosVenda} />
        </TabsContent>
        <TabsContent value="tarefas">
          <TarefasTab negocioId={negocio.id} tarefas={negocio.tarefas} usuarios={usuarios} />
        </TabsContent>
        <TabsContent value="historico">
          <HistoricoTab negocioId={negocio.id} atividades={negocio.atividades} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
