import "server-only";
import { prisma } from "@/lib/db";
import { destinatarioDosAvisos } from "@/lib/server/push-bancario";
import { enviarRespostaTelegram, telegramConfigurado } from "@/lib/server/telegram";
import { telefoneLegivel } from "@/lib/utils/telefone";

/**
 * O WhatsApp disse que o número não tem conta (o whatsapp-service já tentou
 * com e sem o 9 do celular): a mensagem sai da fila e o administrador é
 * avisado no Telegram. Antes, o envio pra número inexistente "dava certo"
 * sem erro e nunca chegava (orçamento #22, 2026-10-14, 3 vezes).
 * false = já tinha sido entregue ou já estava marcada.
 */
export async function registrarFalhaEnvio(mensagemId: string, motivo: string): Promise<boolean> {
  const m = await prisma.mensagem.findUnique({ where: { id: mensagemId }, include: { conversa: { include: { contato: true } } } });
  if (!m || m.externalId || m.falhaEnvio) return false;
  await prisma.mensagem.update({ where: { id: m.id }, data: { falhaEnvio: motivo, falhaEnvioEm: new Date() } });

  const contato = m.conversa.contato;
  const orcamento = /orcamento-(\d+)\.pdf$/i.exec(m.anexoNome ?? "");
  const oQue = orcamento
    ? `o orçamento #${orcamento[1]}`
    : m.anexoNome
      ? `o arquivo ${m.anexoNome}`
      : `a mensagem "${m.texto.length > 60 ? `${m.texto.slice(0, 60)}…` : m.texto}"`;
  const telefone = contato.telefone ? telefoneLegivel(contato.telefone) : "sem telefone";
  console.warn(`[falha-envio] ${oQue} pra ${contato.nome} (${telefone}): ${motivo}`);

  const destino = await destinatarioDosAvisos();
  if (destino?.telegramId && telegramConfigurado()) {
    await enviarRespostaTelegram(destino.telegramId, {
      mensagem: `⚠️ Não enviei ${oQue} pra *${contato.nome}*: o número ${telefone} não tem WhatsApp (nem com nem sem o 9). Confira o telefone no cadastro e me peça pra mandar de novo.`,
    }).catch((erro) => console.error(`[falha-envio] não consegui avisar no Telegram: ${erro instanceof Error ? erro.message : erro}`));
  }
  return true;
}
