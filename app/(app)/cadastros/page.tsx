import { requireModulo } from "@/lib/auth/guards";
import { listarContatosParaPainel } from "@/lib/server/contatos";
import { listarProdutosAgrupados, CATEGORIAS_FIXAS } from "@/lib/server/produtos";
import { CadastrosShell } from "@/app/(app)/cadastros/cadastros-shell";
import type { ContatoVM } from "@/app/(app)/cadastros/lista-contatos";

function paraVM(c: Awaited<ReturnType<typeof listarContatosParaPainel>>[number]): ContatoVM {
  return {
    id: c.id,
    nome: c.nome,
    empresa: c.empresa,
    telefone: c.telefone,
    tags: c.tags,
    tipo: c.tipo,
    cnpj: c.cnpj,
    razaoSocial: c.razaoSocial,
    endereco: c.endereco,
    cidade: c.cidade,
    uf: c.uf,
    cep: c.cep,
    email: c.email,
    representanteLegalNome: c.representanteLegalNome,
    representanteLegalCpf: c.representanteLegalCpf,
    negociosCount: c._count.negocios,
    conversasCount: c._count.conversas,
  };
}

export default async function CadastrosPage() {
  await requireModulo("contatos");

  const [contatos, clientes, fornecedores, produtos] = await Promise.all([
    listarContatosParaPainel("CONTATO"),
    listarContatosParaPainel("CLIENTE"),
    listarContatosParaPainel("FORNECEDOR"),
    listarProdutosAgrupados(),
  ]);

  return (
    <CadastrosShell
      contatos={contatos.map(paraVM)}
      clientes={clientes.map(paraVM)}
      fornecedores={fornecedores.map(paraVM)}
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
        custoCompraCentavos: p.custoCompraCentavos,
        freteCustoCentavos: p.freteCustoCentavos,
        ipiCustoCentavos: p.ipiCustoCentavos,
        outrosCustoCentavos: p.outrosCustoCentavos,
        quantidadeReferencia: p.quantidadeReferencia,
        markupPercentual: p.markupPercentual,
        impostoPercentual: p.impostoPercentual,
        instalacaoCentavos: p.instalacaoCentavos,
      }))}
    />
  );
}
