import Link from "next/link";
import { requireModulo } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { listFunisComEtapas, listNegociosPorFunil } from "@/lib/server/negocios";
import { Button } from "@/components/ui/button";
import { Settings2 } from "lucide-react";
import { NegociosBoardShell } from "@/app/(app)/negocios/board-shell";

export default async function NegociosPage({
  searchParams,
}: {
  searchParams: Promise<{ funil?: string }>;
}) {
  await requireModulo("negocios");
  const { funil: funilIdParam } = await searchParams;

  const funis = await listFunisComEtapas();
  const funilSelecionado = funis.find((f) => f.id === funilIdParam) ?? funis[0];

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
          negocios={negocios.map((n) => ({
            id: n.id,
            titulo: n.titulo,
            etapaId: n.etapaId,
            valorCentavos: n.valorCentavos,
            dataEntradaNaEtapa: n.dataEntradaNaEtapa.toISOString(),
            contatoNome: n.contato.nome,
            responsavelNome: n.responsavel.nome,
          }))}
          contatos={contatos.map((c) => ({ id: c.id, nome: c.nome }))}
          usuarios={usuarios.map((u) => ({ id: u.id, nome: u.nome }))}
        />
      </div>
    </div>
  );
}
