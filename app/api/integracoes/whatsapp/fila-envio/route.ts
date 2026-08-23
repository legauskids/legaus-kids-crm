import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-token";
import { listMensagensPendentesDeRelay, processarMensagensAgendadasVencidas } from "@/lib/server/conversas";

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
  } catch (unauthorized) {
    return unauthorized as Response;
  }

  // O alarme de 1 min do background.js da extensão já bate aqui — aproveita
  // essa mesma batida pra também transformar mensagens agendadas vencidas em
  // mensagens pendentes de relay, sem depender de alguém ter o módulo
  // Atendimento aberto no navegador pra isso acontecer.
  await processarMensagensAgendadasVencidas();

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
