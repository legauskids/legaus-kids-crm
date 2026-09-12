import "server-only";
import { prisma } from "@/lib/db";

/**
 * Registra um evento do sistema (ex: notificação de lead novo, sugestão
 * gerada sob demanda) no mesmo histórico que o agente de comando
 * (lib/server/agente.ts, buscarHistoricoRecente) usa pra dar memória de
 * curto prazo. Sem isso, um evento gerado fora do fluxo de
 * processarComandoAgente nunca entra na "memória" do agente — quando o
 * Marcos respondia só "pode enviar assim" na mesma conversa, o agente não
 * tinha como saber qual telefone ou qual texto isso se referia.
 *
 * Vive num arquivo próprio (não em agente.ts) pra evitar import circular:
 * lib/server/agente-atendimento.ts precisa chamar essa função, e
 * lib/server/agente.ts precisa chamar gerarSugestaoResposta (de
 * agente-atendimento.ts) pra oferecer sugestão sob demanda — os dois não
 * podem se importar direto um ao outro.
 */
export async function registrarEventoNoHistorico(identificador: string, textoComando: string, resposta: string): Promise<void> {
  await prisma.comandoAgente.create({
    data: { origem: "WHATSAPP", identificador, textoComando, resposta, status: "CONCLUIDO" },
  });
}
