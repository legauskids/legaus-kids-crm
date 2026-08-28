import { requireModulo } from "@/lib/auth/guards";
import { listarProdutosAgrupados } from "@/lib/server/produtos";
import { ProdutosShell } from "@/app/(app)/produtos/produtos-shell";

export default async function ProdutosPage() {
  await requireModulo("produtos");
  const produtos = await listarProdutosAgrupados();

  return (
    <ProdutosShell
      produtos={produtos.map((p) => ({
        id: p.id,
        nome: p.nome,
        codigo: p.codigo,
        categoria: p.categoria,
        descricao: p.descricao,
        valorCentavos: p.valorCentavos,
        ativo: p.ativo,
      }))}
    />
  );
}
