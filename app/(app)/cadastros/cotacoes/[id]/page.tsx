import { notFound } from "next/navigation";
import { requireModulo } from "@/lib/auth/guards";
import { buscarCotacaoPorId } from "@/lib/server/cotacoes";
import { CotacaoEditor } from "@/app/(app)/cadastros/cotacoes/[id]/cotacao-editor";
import type { MaoDeObraItem } from "@/lib/utils/cotacao-precificacao";

export default async function CotacaoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModulo("contatos");
  const { id } = await params;
  const cotacao = await buscarCotacaoPorId(id);
  if (!cotacao) notFound();

  return (
    <CotacaoEditor
      cotacao={{
        id: cotacao.id,
        numero: cotacao.numero,
        tipo: cotacao.tipo,
        titulo: cotacao.titulo,
        itens: cotacao.itens.map((i) => ({
          id: i.id,
          secao: i.secao,
          nome: i.nome,
          quantidade: i.quantidade,
          custoUnitarioCentavos: i.custoUnitarioCentavos,
          ordem: i.ordem,
          antecipacaoIcmsCentavos: i.antecipacaoIcmsCentavos,
          freteCentavos: i.freteCentavos,
          instalacaoCentavos: i.instalacaoCentavos,
          markup: i.markup,
          impostoPercentual: i.impostoPercentual,
        })),
        maoDeObra: cotacao.maoDeObra as unknown as MaoDeObraItem[],
        markup: cotacao.markup,
        adicionalCentavos: cotacao.adicionalCentavos,
        instalacaoPercentual: cotacao.instalacaoPercentual,
        freteKm: cotacao.freteKm,
        fretePrecoPorKmCentavos: cotacao.fretePrecoPorKmCentavos,
        impostoCentavos: cotacao.impostoCentavos,
        criadoPorNome: cotacao.criadoPor.nome,
        criadoEm: cotacao.criadoEm.toISOString(),
      }}
    />
  );
}
