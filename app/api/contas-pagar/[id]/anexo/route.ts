import { requireApiOuSessaoUser } from "@/lib/auth/api-token";
import { moduloPermitido } from "@/lib/auth/permissoes";
import { getAnexoContaPagar } from "@/lib/server/contas-pagar";
import { abreNoNavegador, contentDisposition } from "@/lib/utils/negocio-arquivos";

/** Foto ou PDF do boleto/fatura da conta a pagar. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let usuario;
  try {
    usuario = await requireApiOuSessaoUser(request);
  } catch (naoAutenticado) {
    return naoAutenticado as Response;
  }
  if (!moduloPermitido(usuario, "financeiro")) {
    return Response.json({ error: "Sem acesso ao Financeiro." }, { status: 403 });
  }

  const { id } = await params;
  const anexo = await getAnexoContaPagar(id);
  if (!anexo?.anexoBytes || !anexo.anexoMime) {
    return Response.json({ error: "Essa conta não tem arquivo." }, { status: 404 });
  }

  return new Response(new Uint8Array(anexo.anexoBytes), {
    headers: {
      "Content-Type": anexo.anexoMime,
      "Content-Disposition": contentDisposition(anexo.anexoNome || `conta-${id}`, abreNoNavegador(anexo.anexoMime)),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
