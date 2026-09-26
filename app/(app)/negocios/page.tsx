import Link from "next/link";
import { requireModulo } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { listFunisComEtapas, listNegociosPorFunil } from "@/lib/server/negocios";
import { negocioParadoAlemDoPrazo } from "@/lib/utils/dates";
import { Button } from "@/components/ui/button";
import { Settings2 } from "lucide-react";
import { NegociosBoardShell } from "@/app/(app)/negocios/board-shell";

export default async function NegociosPage({
  searchParams,
}: {
  searchParams: Promise<{ funil?: string; parados?: string }>;
}) {
  await requireModulo("negocios");
  const { funil: funilIdParam, parados } = await searchParams;
  const somenteParados = parados === "1";

  const funis = await listFunisComEtapas();
  // Vindo do card "Negócios parados" do dashboard (que conta parados de TODOS
  // os funis) sem funil escolhido: abre no funil com mais parados, em vez de
  // cair no primeiro funil e mostrar um quadro vazio.
  let funilComMaisParados: string | undefined;
  if (somenteParados && !funilIdParam) {
    const abertos = await prisma.negocio.findMany({
      where: { etapa: { tipo: "NORMAL" } },
      select: { funilId: true, dataEntradaNaEtapa: true, etapa: { select: { slaDias: true } } },
    });
    const porFunil = new Map<string, number>();
    for (const n of abertos) {
      if (negocioParadoAlemDoPrazo({ slaDias: n.etapa.slaDias, dataEntradaNaEtapa: n.dataEntradaNaEtapa })) {
        porFunil.set(n.funilId, (porFunil.get(n.funilId) ?? 0) + 1);
      }
    }
    funilComMaisParados = [...porFunil.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }
  const funilSelecionado = funis.find((f) => f.id === (funilIdParam ?? funilComMaisParados)) ?? funis[0];

  const [negocios, contatos, usuarios] = await Promise.all([
    funilSelecionado ? listNegociosPorFunil(funilSelecionado.id) : Promise.resolve([]),
    prisma.contato.findMany({ orderBy: { nome: "asc" } }),
    prisma.user.findMany({ orderBy: { nome: "asc" } }),
  ]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <h1 className="text-xl font-semibold">Negócios</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/negocios/funis">
            <Settings2 className="size-4" />
            Editar funis
          </Link>
        </Button>
      </div>
      <div className="flex-1 overflow-hidden">
        <NegociosBoardShell
          funis={funis.map((f) => ({
            id: f.id,
            nome: f.nome,
            etapas: f.etapas.map((e) => ({ id: e.id, nome: e.nome, ordem: e.ordem, slaDias: e.slaDias, tipo: e.tipo })),
          }))}
          funilSelecionadoId={funilSelecionado?.id ?? ""}
          somenteParadosInicial={somenteParados}
          negocios={negocios.map((n) => {
            const checklistEtapaAtual = n.checklistEtapas.filter((c) => c.etapaId === n.etapaId);
            return {
              id: n.id,
              titulo: n.titulo,
              etapaId: n.etapaId,
              valorCentavos: n.valorCentavos,
              dataEntradaNaEtapa: n.dataEntradaNaEtapa.toISOString(),
              contatoNome: n.contato?.nome ?? "Sem contato",
              responsavelNome: n.responsavel.nome,
              checklistTotal: checklistEtapaAtual.length,
              checklistConcluidos: checklistEtapaAtual.filter((c) => c.concluido).length,
            };
          })}
          contatos={contatos.map((c) => ({ id: c.id, nome: c.nome }))}
          usuarios={usuarios.map((u) => ({ id: u.id, nome: u.nome }))}
        />
      </div>
    </div>
  );
}
