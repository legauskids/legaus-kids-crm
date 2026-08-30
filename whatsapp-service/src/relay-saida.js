import { chamarApi, baixarArquivo } from "./crm-api.js";

const INTERVALO_MS = 5000;

/**
 * Poll na fila de envio do CRM (mesma rota que extension/background.js já
 * usava, GET /fila-envio — inclui negócios, notas, respostas rápidas,
 * envio em massa e mensagens agendadas vencidas, tudo já resolvido do lado
 * do CRM). Sem custo de "recarregar navegador" aqui, então da pra pollar
 * bem mais rápido que o alarme de 1 min da extensão.
 */
export function iniciarRelayDeSaida(sock) {
  setInterval(() => processarFila(sock), INTERVALO_MS);
  processarFila(sock);
}

async function processarFila(sock) {
  let pendentes;
  try {
    const dados = await chamarApi("/api/integracoes/whatsapp/fila-envio");
    pendentes = dados.mensagens ?? [];
  } catch (erro) {
    console.error("[relay-saida] Falha ao consultar a fila de envio:", erro.message);
    return;
  }

  for (const item of pendentes) {
    try {
      const jid = `${item.telefone}@s.whatsapp.net`;
      let enviada;
      if (item.anexoUrl) {
        const arquivo = await baixarArquivo(item.anexoUrl);
        enviada = await sock.sendMessage(jid, {
          document: arquivo,
          mimetype: item.anexoMimetype || "application/pdf",
          fileName: item.anexoNome || "arquivo.pdf",
          caption: item.texto,
        });
      } else {
        enviada = await sock.sendMessage(jid, { text: item.texto });
      }
      if (!enviada?.key?.id) {
        console.error(`[relay-saida] Envio pra ${item.telefone} não retornou id de mensagem.`);
        continue;
      }
      await chamarApi("/api/integracoes/whatsapp/confirmar-envio", {
        method: "POST",
        body: JSON.stringify({ mensagemId: item.mensagemId, externalId: enviada.key.id }),
      });
      console.log(`[relay-saida] Enviado pra ${item.telefone}: "${item.texto.slice(0, 40)}"`);
    } catch (erro) {
      console.error(`[relay-saida] Falha ao enviar mensagem ${item.mensagemId} pra ${item.telefone}:`, erro.message);
    }
  }
}
