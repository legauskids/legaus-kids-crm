import { requireApiOuSessaoUser } from "@/lib/auth/api-token";
import { prisma } from "@/lib/db";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiOuSessaoUser(request);
  } catch (naoAutenticado) {
    return naoAutenticado as Response;
  }

  const { id } = await params;
  const notaFiscal = await prisma.notaFiscal.findUnique({ where: { id }, select: { danfeBytes: true, numero: true } });
  if (!notaFiscal?.danfeBytes) {
    return Response.json({ error: "DANFE não disponível." }, { status: 404 });
  }

  return new Response(new Uint8Array(notaFiscal.danfeBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="danfe-${notaFiscal.numero ?? id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
