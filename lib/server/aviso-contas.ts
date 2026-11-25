import "server-only";
import { prisma } from "@/lib/db";
import { gerarContasFixas } from "@/lib/server/contas-pagar";
import { destinatarioDosAvisos } from "@/lib/server/push-bancario";
import { enviarRespostaTelegram, telegramConfigurado } from "@/lib/server/telegram";
import { diaBrasilia, inicioDoDiaBrasilia } from "@/lib/utils/brasilia";
import { limiteDoAviso, montarAvisoContas, turnoDoMomento, type CanalAviso, type TurnoAviso } from "@/lib/utils/aviso-contas";
import type { Botoes } from "@/lib/utils/agente-canal";

// Avisos diários das contas a pagar (pedido de 2026-11-23, etapa 3). Quem
// chama é o relógio do servidor da Legaus (whatsapp-service), a cada minuto,
// junto com os posts agendados — ver app/api/integracoes/publicar-agendados.
// Cada canal recebe uma vez por dia e turno (AvisoContasPagar).
// Só pelo Telegram: o Marcos tirou o WhatsApp em 2026-11-25 (a variável
// AVISO_CONTAS_WHATSAPP não é mais lida).

export type DestinoAviso = { canal: string; tipo: CanalAviso; enviar: (aviso: { mensagem: string; botoes?: Botoes }) => Promise<void> };

async function destinosDoAviso(): Promise<DestinoAviso[]> {
  const admin = await destinatarioDosAvisos();
  if (!admin?.telegramId || !telegramConfigurado()) return [];
  const chat = admin.telegramId;
  return [{ canal: "telegram", tipo: "telegram", enviar: (aviso) => enviarRespostaTelegram(chat, aviso) }];
}

function jaReservado(erro: unknown): boolean {
  return typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002";
}

export type ResultadoAvisos = { turno: TurnoAviso | null; enviados: string[]; falhas: string[] };

/**
 * Manda o aviso do turno (8h ou 17h) para os canais que ainda não receberam
 * hoje. Sem nada para avisar, só registra (não manda mensagem vazia). Envio
 * que falha é tentado de novo no minuto seguinte, até o fim da janela.
 * `destinos` só no teste (scripts/teste-avisos-contas.ts), para não mandar de verdade.
 */
export async function rodarAvisosDeContas(agora = new Date(), destinos?: DestinoAviso[]): Promise<ResultadoAvisos> {
  const turno = turnoDoMomento(agora);
  const resultado: ResultadoAvisos = { turno, enviados: [], falhas: [] };
  if (!turno) return resultado;
  const dia = diaBrasilia(agora);
  const feitos = new Set((await prisma.avisoContasPagar.findMany({ where: { dia, turno }, select: { canal: true } })).map((a) => a.canal));
  const faltam = (destinos ?? (await destinosDoAviso())).filter((d) => !feitos.has(d.canal));
  if (!faltam.length) return resultado;

  await gerarContasFixas(dia);
  const [abertas, rascunhos] = await Promise.all([
    prisma.contaPagar.findMany({
      where: {
        status: "ABERTA",
        vencimento: { lt: inicioDoDiaBrasilia(limiteDoAviso(turno, dia)), ...(turno === "TARDE" ? { gte: inicioDoDiaBrasilia(dia) } : {}) },
      },
      select: { id: true, vencimento: true, valorCentavos: true, fornecedor: true, parcela: true, totalParcelas: true },
    }),
    turno === "MANHA" ? prisma.contaPagar.count({ where: { status: "A_CONFIRMAR" } }) : Promise.resolve(0),
  ]);
  const contas = abertas.map((c) => ({ ...c, vencimento: diaBrasilia(c.vencimento) }));

  for (const destino of faltam) {
    const aviso = montarAvisoContas({ turno, hoje: dia, contas, rascunhos, canal: destino.tipo });
    // Reserva antes de mandar: duas chamadas ao mesmo tempo não mandam duas vezes.
    try {
      await prisma.avisoContasPagar.create({ data: { dia, turno, canal: destino.canal, contas: aviso ? contas.length : 0 } });
    } catch (erro) {
      if (jaReservado(erro)) continue;
      throw erro;
    }
    if (!aviso) continue;
    try {
      await destino.enviar(aviso);
      resultado.enviados.push(destino.canal);
    } catch (erro) {
      await prisma.avisoContasPagar.deleteMany({ where: { dia, turno, canal: destino.canal } });
      resultado.falhas.push(destino.canal);
      console.error(`[aviso-contas] ${turno} de ${dia} não saiu (${destino.tipo}): ${erro instanceof Error ? erro.message : erro}`);
    }
  }
  if (resultado.enviados.length) console.log(`[aviso-contas] ${turno} de ${dia}: ${contas.length} conta(s) → ${resultado.enviados.map((c) => c.split(":")[0]).join(", ")}`);
  return resultado;
}
