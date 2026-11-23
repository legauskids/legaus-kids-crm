import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModulo } from "@/lib/auth/guards";
import { buscarOrcamentoPorId, listarClientesParaOrcamento } from "@/lib/server/orcamentos";
import { listarNegociosParaOrcamento } from "@/lib/server/orcamento-negocio";
import { prisma } from "@/lib/db";
import { listarAnexosOrcamento } from "@/lib/server/anexos-orcamento";
import { OrcamentoEditor } from "@/app/(app)/orcamentos/orcamento-editor";
import { ControleStatusOrcamento } from "@/app/(app)/orcamentos/status-orcamento";
import { AnexosOrcamento } from "./anexos-orcamento";
import { Handshake } from "lucide-react";

export default async function OrcamentoDetalhePage({
  params,
}: {
  params: Promise<{ orcamentoId: string }>;
}) {
  await requireModulo("orcamentos");
  const { orcamentoId } = await params;

  const [orcamento, contatos, produtos, anexos] = await Promise.all([
    buscarOrcamentoPorId(orcamentoId),
    listarClientesParaOrcamento(),
    prisma.produto.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, codigo: true, categoria: true, descricao: true, imagemUrl: true, valorCentavos: true },
      orderBy: { nome: "asc" },
    }),
    listarAnexosOrcamento(orcamentoId),
  ]);

  if (!orcamento) notFound();
  const negocios = await listarNegociosParaOrcamento(orcamento.negocioId);
  const negocio = negocios.find((n) => n.id === orcamento.negocioId) ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Orçamento #{String(orcamento.numero).padStart(4, "0")}
          </h1>
          {negocio && (
            <Link href={`/negocios/${negocio.id}`} className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              <Handshake className="size-4 shrink-0" />
              <span className="break-words">Negócio: {negocio.titulo}</span>
            </Link>
          )}
        </div>
        <ControleStatusOrcamento orcamentoId={orcamento.id} statusAtual={orcamento.status} />
      </div>
      <OrcamentoEditor
        orcamento={{
          id: orcamento.id,
          contatoId: orcamento.contatoId,
          negocioId: orcamento.negocioId,
          observacoes: orcamento.observacoes,
          descontoCentavos: orcamento.descontoCentavos,
          validadeDias: orcamento.validadeDias,
          itens: orcamento.itens.map((i) => ({
            produtoId: i.produtoId,
            nome: i.nome,
            descricao: i.descricao,
            quantidade: i.quantidade,
            valorUnitarioCentavos: i.valorUnitarioCentavos,
            imagemUrl: i.produto?.imagemUrl ?? null,
          })),
        }}
        contatos={contatos}
        produtos={produtos}
        negocios={negocios}
      />
      <AnexosOrcamento orcamentoId={orcamento.id} numero={orcamento.numero} anexosIniciais={anexos} />
    </div>
  );
}
