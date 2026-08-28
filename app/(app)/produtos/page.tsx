import { requireModulo } from "@/lib/auth/guards";
import { listarProdutosAgrupados, CATEGORIAS_FIXAS } from "@/lib/server/produtos";
import { ProdutosShell } from "@/app/(app)/produtos/produtos-shell";

export default async function ProdutosPage() {
  await requireModulo("produtos");
  const produtos = await listarProdutosAgrupados();

  return (
    <ProdutosShell
      categoriasFixas={CATEGORIAS_FIXAS}
      produtos={produtos.map((p) => ({
        id: p.id,
        nome: p.nome,
        codigo: p.codigo,
        categoria: p.categoria,
        descricao: p.descricao,
        imagemUrl: p.imagemUrl,
        valorCentavos: p.valorCentavos,
        ativo: p.ativo,
      }))}
    />
  );
}
