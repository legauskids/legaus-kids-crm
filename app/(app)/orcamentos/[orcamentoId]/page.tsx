import { notFound } from "next/navigation";
import { requireModulo } from "@/lib/auth/guards";
import { buscarOrcamentoPorId } from "@/lib/server/orcamentos";
import { prisma } from "@/lib/db";
import { OrcamentoEditor } from "@/app/(app)/orcamentos/orcamento-editor";
import { ControleStatusOrcamento } from "@/app/(app)/orcamentos/status-orcamento";

export default async function OrcamentoDetalhePage({
  params,
}: {
  params: Promise<{ orcamentoId: string }>;
}) {
  await requireModulo("orcamentos");
  const { orcamentoId } = await params;

  const [orcamento, contatos, produtos] = await Promise.all([
    buscarOrcamentoPorId(orcamentoId),
    prisma.contato.findMany({
      select: { id: true, nome: true, empresa: true, razaoSocial: true },
      orderBy: { nome: "asc" },
    }),
    prisma.produto.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, codigo: true, categoria: true, imagemUrl: true, valorCentavos: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  if (!orcamento) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Orçamento #{String(orcamento.numero).padStart(4, "0")}
        </h1>
        <ControleStatusOrcamento orcamentoId={orcamento.id} statusAtual={orcamento.status} />
      </div>
      <OrcamentoEditor
        orcamento={{
          id: orcamento.id,
          contatoId: orcamento.contatoId,
          observacoes: orcamento.observacoes,
          descontoCentavos: orcamento.descontoCentavos,
          validadeDias: orcamento.validadeDias,
          itens: orcamento.itens.map((i) => ({
            produtoId: i.produtoId,
            nome: i.nome,
            quantidade: i.quantidade,
            valorUnitarioCentavos: i.valorUnitarioCentavos,
          })),
        }}
        contatos={contatos}
        produtos={produtos}
      />
    </div>
  );
}
