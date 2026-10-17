import { requireApiOuSessaoUser } from "@/lib/auth/api-token";
import { imagemDaArte } from "@/lib/server/marketing";

// JPEG de uma arte de post (lib/server/postagem-render.ts). Desenha na
// primeira vez que é aberta e guarda; ?baixar=1 devolve como download.
// Só pra quem está logado — a URL pública pra Meta baixar é da etapa 3.
export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiOuSessaoUser(request);
  } catch (naoAutenticado) {
    return naoAutenticado as Response;
  }

  const { id } = await params;
  const arte = await imagemDaArte(id);
  if (!arte) {
    return Response.json({ error: "Arte não encontrada." }, { status: 404 });
  }

  const baixar = new URL(request.url).searchParams.has("baixar");
  return new Response(new Uint8Array(arte.buffer), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=300",
      ...(baixar && { "Content-Disposition": `attachment; filename="legaus-post-${arte.numero}-${String(arte.ordem + 1).padStart(2, "0")}.jpg"` }),
    },
  });
}
