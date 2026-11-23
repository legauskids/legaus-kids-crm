import { requireApiOuSessaoUser } from "@/lib/auth/api-token";
import { moduloPermitido } from "@/lib/auth/permissoes";
import { gerarPdfContasPagar } from "@/lib/server/pdf/contas-pagar-pdf";
import { filtroContasDaUrl } from "@/lib/utils/contas-pagar";
import { contentDisposition } from "@/lib/utils/negocio-arquivos";

/** Relatório de contas a pagar em PDF, com os mesmos filtros da aba (pedido de 2026-11-23). */
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
  const { buffer, nomeArquivo } = await gerarPdfContasPagar(filtro);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(nomeArquivo, true),
      "Cache-Control": "private, no-store",
    },
  });
}
