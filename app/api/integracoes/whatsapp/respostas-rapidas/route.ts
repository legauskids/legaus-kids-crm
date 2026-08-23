import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-token";
import { listRespostasRapidas } from "@/lib/server/respostas-rapidas";

export async function GET(request: Request) {
  let user;
  try {
    user = await requireApiUser(request);
  } catch (unauthorized) {
    return unauthorized as Response;
  }

  const respostas = await listRespostasRapidas(user.id);
  return NextResponse.json({
    respostas: respostas.map((r) => ({ id: r.id, titulo: r.titulo, texto: r.texto })),
  });
}
