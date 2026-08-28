import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-token";
import { listarProdutosAgrupados } from "@/lib/server/produtos";

/**
 * Endpoint pra automação (agente de IA, comando de voz, etc.) consultar o
 * catálogo antes de montar um orçamento — mesmo mecanismo de token Bearer
 * que o whatsapp-service já usa. Ver /api/agente/orcamentos e
 * /api/agente/contatos pros próximos passos de um fluxo automatizado.
 */
export async function GET(request: Request) {
  try {
    await requireApiUser(request);
  } catch (unauthorized) {
    return unauthorized as Response;
  }

  const produtos = await listarProdutosAgrupados();
  return NextResponse.json({
    produtos: produtos
      .filter((p) => p.ativo)
      .map((p) => ({
        id: p.id,
        nome: p.nome,
        codigo: p.codigo,
        categoria: p.categoria,
        descricao: p.descricao,
        valorCentavos: p.valorCentavos,
      })),
  });
}
