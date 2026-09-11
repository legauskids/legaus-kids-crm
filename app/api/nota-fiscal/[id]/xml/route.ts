import { requireApiOuSessaoUser } from "@/lib/auth/api-token";
import { prisma } from "@/lib/db";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiOuSessaoUser(request);
  } catch (naoAutenticado) {
    return naoAutenticado as Response;
  }

  const { id } = await params;
  const notaFiscal = await prisma.notaFiscal.findUnique({ where: { id }, select: { xmlBytes: true, numero: true } });
  if (!notaFiscal?.xmlBytes) {
    return Response.json({ error: "XML não disponível." }, { status: 404 });
  }

  return new Response(new Uint8Array(notaFiscal.xmlBytes), {
    headers: {
      "Content-Type": "application/xml",
      "Content-Disposition": `attachment; filename="nfe-${notaFiscal.numero ?? id}.xml"`,
      "Cache-Control": "no-store",
    },
  });
}
