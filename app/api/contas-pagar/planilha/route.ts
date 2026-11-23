import { requireApiOuSessaoUser } from "@/lib/auth/api-token";
import { moduloPermitido } from "@/lib/auth/permissoes";
import { listarContasPagar } from "@/lib/server/contas-pagar";
import { diaBrasilia } from "@/lib/utils/brasilia";
import { centroDaConta, filtroContasDaUrl, planilhaContas, rotuloParcela, situacaoLegivel } from "@/lib/utils/contas-pagar";
import { contentDisposition } from "@/lib/utils/negocio-arquivos";

/** Relatório de contas a pagar para o Excel, com os mesmos filtros da aba (pedido de 2026-11-23). */
export async function GET(request: Request) {
  let usuario;
  try {
    usuario = await requireApiOuSessaoUser(request);
  } catch (naoAutenticado) {
    return naoAutenticado as Response;
  }
  if (!moduloPermitido(usuario, "financeiro")) {
    return Response.json({ error: "Sem acesso ao Financeiro." }, { status: 403 });
  }

  const filtro = filtroContasDaUrl(Object.fromEntries(new URL(request.url).searchParams));
  const hoje = diaBrasilia(new Date());
  const contas = await listarContasPagar(filtro);
  const planilha = planilhaContas(
    contas.map((c) => ({
      vencimento: c.vencimento,
      fornecedor: c.fornecedor,
      descricao: c.descricao,
      parcela: rotuloParcela(c.parcela, c.totalParcelas),
      categoria: c.categoriaNome,
      centro: centroDaConta(c),
      valorCentavos: c.valorCentavos,
      situacao: situacaoLegivel(c, hoje),
      pagaEm: c.pagaEm,
      codigoPagamento: c.codigoPagamento,
    })),
  );
  return new Response(planilha, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": contentDisposition(`contas-a-pagar-${hoje}.csv`, false),
      "Cache-Control": "private, no-store",
    },
  });
}
