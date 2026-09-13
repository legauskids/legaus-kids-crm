import { notFound } from "next/navigation";
import Link from "next/link";
import { requireModulo } from "@/lib/auth/guards";
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
  searchParams,
}: {
  params: Promise<{ negocioId: string }>;
  searchParams: Promise<{ abrirTarefa?: string }>;
}) {
  await requireModulo("negocios");
  const { negocioId } = await params;
  const { abrirTarefa } = await searchParams;
  const negocio = await getNegocioDetalhado(negocioId);
  if (!negocio) notFound();

  const [usuarios, contatos] = await Promise.all([
    prisma.user.findMany({ orderBy: { nome: "asc" } }),
    prisma.contato.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
  ]);
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
          <h1 className="text-xl font-bold tracking-tight text-foreground">{negocio.titulo}</h1>
          <p className="text-sm text-muted-foreground">
            {negocio.contato?.nome ?? "Sem contato"} · <span className="font-semibold text-success">{centavosParaReais(negocio.valorCentavos)}</span>
          </p>
        </div>
      </div>

      {negocio.excluidoEm && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <p className="font-semibold">Este negócio foi excluído em {negocio.excluidoEm.toLocaleDateString("pt-BR")}.</p>
          {negocio.motivoExclusao && <p className="mt-0.5">Motivo: {negocio.motivoExclusao}</p>}
        </div>
      )}

      <EtapaBreadcrumb
        negocioId={negocio.id}
        etapaAtualId={negocio.etapaId}
        etapas={negocio.funil.etapas.map((e) => ({ id: e.id, nome: e.nome, ordem: e.ordem, tipo: e.tipo }))}
        isFunilVenda={isFunilVenda}
        isFunilPosVenda={isFunilPosVenda}
      />

      <Tabs defaultValue={abrirTarefa ? "tarefas" : "dados"}>
        <TabsList>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="tarefas">Tarefas ({negocio.tarefas.length})</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="dados">
          <DadosTab negocio={negocio} contatos={contatos} usuarios={usuarios} isFunilPosVenda={isFunilPosVenda} />
        </TabsContent>
        <TabsContent value="tarefas">
          <TarefasTab
            negocioId={negocio.id}
            tarefas={negocio.tarefas}
            usuarios={usuarios}
            abrirFormularioInicialmente={abrirTarefa === "1"}
          />
        </TabsContent>
        <TabsContent value="historico">
          <HistoricoTab negocioId={negocio.id} atividades={negocio.atividades} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
