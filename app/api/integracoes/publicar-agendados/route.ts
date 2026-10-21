import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-token";
import { rodarRelogioDePublicacao } from "@/lib/server/meta-publicacao";

// Relógio do agendamento dos posts (etapa 3, 2026-10-21): o whatsapp-service
// do servidor da Legaus chama a cada minuto com o token de integração. A
// Vercel gratuita só roda tarefa agendada uma vez por dia.
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    await requireApiUser(request);
  } catch (naoAutenticado) {
    return naoAutenticado as Response;
  }
  return NextResponse.json(await rodarRelogioDePublicacao());
}
