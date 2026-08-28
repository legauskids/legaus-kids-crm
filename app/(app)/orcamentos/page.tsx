import { requireModulo } from "@/lib/auth/guards";
import { listarOrcamentos, calcularTotalCentavos } from "@/lib/server/orcamentos";
import { OrcamentosLista } from "@/app/(app)/orcamentos/orcamentos-lista";

export default async function OrcamentosPage() {
  await requireModulo("orcamentos");
  const orcamentos = await listarOrcamentos();

  return (
    <OrcamentosLista
      orcamentos={orcamentos.map((o) => ({
        id: o.id,
        numero: o.numero,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
        contatoNome: o.contato?.nome ?? null,
        responsavelNome: o.responsavel.nome,
        totalCentavos: calcularTotalCentavos(o.itens, o.descontoCentavos),
      }))}
    />
  );
}
