import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-token";
import { listMensagensPendentesDeRelay } from "@/lib/server/conversas";

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
  } catch (unauthorized) {
    return unauthorized as Response;
  }

  const pendentes = await listMensagensPendentesDeRelay();

  return NextResponse.json({
    mensagens: pendentes.map((m) => ({
      mensagemId: m.id,
      telefone: m.conversa.contato.telefone,
      texto: m.texto,
      enviadaEm: m.enviadaEm.toISOString(),
    })),
  });
}
