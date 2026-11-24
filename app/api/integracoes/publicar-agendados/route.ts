import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-token";
import { rodarRelogioDePublicacao } from "@/lib/server/meta-publicacao";
import { rodarAvisosDeContas, type ResultadoAvisos } from "@/lib/server/aviso-contas";

// Relógio do agendamento dos posts (etapa 3, 2026-10-21): o whatsapp-service
// do servidor da Legaus chama a cada minuto com o token de integração. A
// Vercel gratuita só roda tarefa agendada uma vez por dia.
//
// Desde 2026-11-24 o mesmo relógio manda os avisos das contas a pagar (8h e
// 17h — lib/server/aviso-contas.ts). Vão antes dos posts, que podem demorar
// minutos; uma falha deles não segura a publicação.
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    await requireApiUser(request);
  } catch (naoAutenticado) {
    return naoAutenticado as Response;
  }
  let avisosContas: ResultadoAvisos | { erro: string };
  try {
    avisosContas = await rodarAvisosDeContas();
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    console.error(`[aviso-contas] falhou: ${motivo}`);
    avisosContas = { erro: motivo };
  }
  return NextResponse.json({ ...(await rodarRelogioDePublicacao()), avisosContas });
}
