import { notFound } from "next/navigation";
import { requireModulo } from "@/lib/auth/guards";
import { buscarOrcamentoPorId } from "@/lib/server/orcamentos";
import { OrcamentoDocumento } from "@/app/(app)/orcamentos/orcamento-documento";
import { BotaoImprimir } from "@/app/(app)/orcamentos/[orcamentoId]/imprimir/botao-imprimir";

export default async function ImprimirOrcamentoPage({
  params,
}: {
  params: Promise<{ orcamentoId: string }>;
}) {
  await requireModulo("orcamentos");
  const { orcamentoId } = await params;
  const orcamento = await buscarOrcamentoPorId(orcamentoId);
  if (!orcamento) notFound();

  return (
    <div className="min-h-full bg-neutral-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-3xl justify-end print:hidden">
        <BotaoImprimir />
      </div>
      <OrcamentoDocumento
        orcamento={{
          numero: orcamento.numero,
          status: orcamento.status,
          createdAt: orcamento.createdAt,
          validadeDias: orcamento.validadeDias,
          observacoes: orcamento.observacoes,
          descontoCentavos: orcamento.descontoCentavos,
          contato: orcamento.contato
            ? {
                nome: orcamento.contato.nome,
                razaoSocial: orcamento.contato.razaoSocial,
                cnpj: orcamento.contato.cnpj,
                telefone: orcamento.contato.telefone,
                endereco: orcamento.contato.endereco,
                cidade: orcamento.contato.cidade,
                uf: orcamento.contato.uf,
              }
            : null,
          responsavel: { nome: orcamento.responsavel.nome },
          itens: orcamento.itens.map((i) => ({
            nome: i.nome,
            quantidade: i.quantidade,
            valorUnitarioCentavos: i.valorUnitarioCentavos,
          })),
        }}
      />
    </div>
  );
}
