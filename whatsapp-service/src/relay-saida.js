import { chamarApi, baixarArquivo } from "./crm-api.js";

const INTERVALO_MS = 5000;

// index.js chama iniciarRelayDeSaida de novo a cada reconexão (comum — ver
// os comentários sobre instabilidade em index.js). Sem isso, cada
// reconexão empilhava mais um setInterval rodando em paralelo com o(s)
// anterior(es), todos pollando a fila ao mesmo tempo — o que reabre risco
// de mandar a mesma mensagem em duplicidade de verdade mesmo com a
// "reserva" de 90s do lado do CRM (duas consultas simultâneas podem pegar
// a mesma mensagem antes de qualquer uma marcar a tentativa). Só um
// intervalo por vez, sempre com o `sock` mais recente.
let intervaloAtual = null;
// Mesmo com um único intervalo, se processarFila demorar mais que 5s (fila
// grande, rede lenta) o próximo tick não pode começar em cima do anterior.
let processandoAgora = false;

/**
 * Poll na fila de envio do CRM (mesma rota que extension/background.js já
 * usava, GET /fila-envio — inclui negócios, notas, respostas rápidas,
 * envio em massa e mensagens agendadas vencidas, tudo já resolvido do lado
 * do CRM). Sem custo de "recarregar navegador" aqui, então da pra pollar
 * bem mais rápido que o alarme de 1 min da extensão.
 */
export function iniciarRelayDeSaida(sock) {
  if (intervaloAtual) clearInterval(intervaloAtual);
  intervaloAtual = setInterval(() => processarFila(sock), INTERVALO_MS);
  processarFila(sock);
}

async function processarFila(sock) {
  if (processandoAgora) return;
  processandoAgora = true;
  try {
    await processarFilaAgora(sock);
  } finally {
    processandoAgora = false;
  }
}

/**
 * Visto ao vivo em 2026-09-04: mandar direto pra `${telefone}@s.whatsapp.net`
 * fazia o Baileys devolver um key.id válido (status "PENDING") — parecendo
 * sucesso — mas a mensagem nunca chegava de verdade no celular de destino
 * (confirmado com o Marcos testando na hora, várias vezes).
 *
 * Causa raiz encontrada com log de diagnóstico: `sock.onWhatsApp(telefone)`
 * — a forma oficialmente documentada de resolver o destino antes de mandar
 * (README.md, "Check If ID Exists in Whatsapp") — devolveu um `jid`
 * (`result.jid`) com um dígito a menos que o telefone real (perdeu o "9"
 * extra do celular brasileiro: "5555999603257" virou "555599603257"),
 * quase certamente uma normalização antiga do WhatsApp pra números do
 * Brasil (o país adicionou o 9º dígito nos celulares há alguns anos, e
 * lógica mais velha às vezes ainda assume o formato de 8 dígitos). Mandar
 * pra esse JID errado nunca daria erro (o número pode nem existir, ou
 * existir como outra coisa) — só nunca chegava a lugar nenhum.
 *
 * `result.lid`, por outro lado, veio consistente com o LID que já
 * tínhamos resolvido por outro caminho (ver lid-cache.js) — não passa
 * pela mesma normalização de telefone, então usa o LID como destino
 * quando disponível, e só cai pro telefone (como veio, sem reformatar)
 * quando não há LID pra esse contato.
 */
async function resolverJidParaEnvio(sock, telefone) {
  const jidIngenuo = `${telefone}@s.whatsapp.net`;
  try {
    const [resultado] = (await sock.onWhatsApp(telefone)) ?? [];
    console.log(`[relay-saida] onWhatsApp(${telefone}) ->`, JSON.stringify(resultado));
    if (resultado?.exists && resultado.lid) return resultado.lid;
  } catch (erro) {
    console.error(`[relay-saida] Falha ao resolver JID de ${telefone} via onWhatsApp, usando o telefone direto:`, erro.message);
  }
  return jidIngenuo;
}

async function processarFilaAgora(sock) {
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
      const jid = await resolverJidParaEnvio(sock, item.telefone);
      console.log(`[relay-saida] Mandando pra jid resolvido: ${jid}`);
      let enviada;
      if (item.anexoUrl) {
        const arquivo = await baixarArquivo(item.anexoUrl);
        const ehImagem = (item.anexoMimetype || "").startsWith("image/");
        enviada = ehImagem
          ? await sock.sendMessage(jid, { image: arquivo, caption: item.texto })
          : await sock.sendMessage(jid, {
              document: arquivo,
              mimetype: item.anexoMimetype || "application/pdf",
              fileName: item.anexoNome || "arquivo.pdf",
              caption: item.texto,
            });
      } else {
        enviada = await sock.sendMessage(jid, { text: item.texto });
      }
      console.log(`[relay-saida] Retorno do sendMessage:`, JSON.stringify(enviada));
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
