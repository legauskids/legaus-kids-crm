import { notFound } from "next/navigation";
import { buscarOrcamentoPorTokenPublico } from "@/lib/server/orcamentos";
import { listarAnexosOrcamento } from "@/lib/server/anexos-orcamento";
import { OrcamentoDocumento } from "@/app/(app)/orcamentos/orcamento-documento";
import { AnexosDoOrcamento } from "@/app/(app)/orcamentos/folha-anexos";
import { BotaoImprimir } from "@/app/(app)/orcamentos/[orcamentoId]/imprimir/botao-imprimir";

export default async function OrcamentoPublicoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const orcamento = await buscarOrcamentoPorTokenPublico(token);
  if (!orcamento) notFound();
  const anexos = await listarAnexosOrcamento(orcamento.id);

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
            descricao: i.descricao,
            quantidade: i.quantidade,
            valorUnitarioCentavos: i.valorUnitarioCentavos,
            imagemUrl: i.produto?.imagemUrl ?? null,
          })),
        }}
      />
      {/* Imagens pela rota com o token deste link (quem recebeu não tem login). */}
      <AnexosDoOrcamento anexos={anexos} numero={orcamento.numero} tokenPublico={token} />
    </div>
  );
}
