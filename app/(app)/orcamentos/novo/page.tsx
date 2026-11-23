import { requireModulo } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { listarClientesParaOrcamento } from "@/lib/server/orcamentos";
import { listarNegociosParaOrcamento, negocioParaVincular } from "@/lib/server/orcamento-negocio";
import { OrcamentoEditor } from "@/app/(app)/orcamentos/orcamento-editor";

export default async function NovoOrcamentoPage({ searchParams }: { searchParams: Promise<{ negocio?: string }> }) {
  await requireModulo("orcamentos");
  const { negocio: negocioParam } = await searchParams;

  const [contatos, produtos, negocios, negocioDeOrigem] = await Promise.all([
    listarClientesParaOrcamento(),
    prisma.produto.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, codigo: true, categoria: true, descricao: true, imagemUrl: true, valorCentavos: true },
      orderBy: { nome: "asc" },
    }),
    listarNegociosParaOrcamento(negocioParam),
    negocioParam ? negocioParaVincular(negocioParam) : null,
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-bold tracking-tight text-foreground">Novo orçamento</h1>
      <OrcamentoEditor
        contatos={contatos}
        produtos={produtos}
        negocios={negocios}
        inicial={negocioDeOrigem ? { contatoId: negocioDeOrigem.contatoId, negocioId: negocioDeOrigem.id } : undefined}
      />
      <p className="text-xs text-muted-foreground">Depois de criar o orçamento, dá pra anexar imagens a ele (saem numa folha depois do orçamento).</p>
    </div>
  );
}
