import { requireApiOuSessaoUser } from "@/lib/auth/api-token";
import { moduloPermitido } from "@/lib/auth/permissoes";
import { getAnexoDespesa } from "@/lib/server/despesas";

/** Comprovante ou áudio original da despesa — abre no navegador (inline). */
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
  const anexo = await getAnexoDespesa(id);
  if (!anexo?.anexoBytes) {
    return Response.json({ error: "Essa despesa não tem arquivo." }, { status: 404 });
  }

  const nome = (anexo.anexoNome || `despesa-${id}`).replace(/["\r\n]/g, "");
  return new Response(new Uint8Array(anexo.anexoBytes), {
    headers: {
      "Content-Type": anexo.anexoMime || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(nome)}"`,
      "Cache-Control": "no-store",
    },
  });
}
