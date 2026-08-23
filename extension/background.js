// Service worker (Manifest V3). Faz as chamadas de rede pro backend (o
// content script só troca mensagens com este arquivo via chrome.runtime)
// e o polling periódico da fila de envio via chrome.alarms — setInterval
// não sobrevive a um service worker suspenso, chrome.alarms sim.

const ALARME_FILA_ENVIO = "legaus-poll-fila-envio";

async function getConfig() {
  const { apiUrl, apiToken } = await chrome.storage.local.get(["apiUrl", "apiToken"]);
  return { apiUrl: apiUrl || "https://crm.legauskids.com.br", apiToken: apiToken || "" };
}

async function chamarApi(caminho, options = {}) {
  const { apiUrl, apiToken } = await getConfig();
  if (!apiToken) return null;

  const resposta = await fetch(`${apiUrl}${caminho}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
      ...options.headers,
    },
  });
  if (!resposta.ok) {
    console.error("[Legaus] Erro na API:", caminho, resposta.status);
    return null;
  }
  return resposta.json();
}

/**
 * Proxy genérico pro painel lateral (side-panel.js): o content script não
 * pode fazer fetch direto pra fora de web.whatsapp.com (o CSP da própria
 * página bloqueia), então repassa pra cá via chrome.runtime.sendMessage.
 */
async function chamarApiComDetalhes(caminho, options = {}) {
  const { apiUrl, apiToken } = await getConfig();
  try {
    const resposta = await fetch(`${apiUrl}${caminho}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
        ...options.headers,
      },
    });
    const dados = await resposta.json().catch(() => ({}));
    return { ok: resposta.ok, status: resposta.status, dados };
  } catch (erro) {
    return { ok: false, status: 0, dados: { error: erro.message } };
  }
}

async function reportarMensagemRecebida(payload) {
  return chamarApi("/api/integracoes/whatsapp/mensagens", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function buscarFilaDeEnvio() {
  const resultado = await chamarApi("/api/integracoes/whatsapp/fila-envio");
  return resultado?.mensagens ?? [];
}

async function confirmarEnvio(mensagemId, externalId) {
  await chamarApi("/api/integracoes/whatsapp/confirmar-envio", {
    method: "POST",
    body: JSON.stringify({ mensagemId, externalId }),
  });
}

async function encontrarAbaDoWhatsApp() {
  const abas = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  return abas[0] ?? null;
}

async function processarFilaDeEnvio() {
  const pendentes = await buscarFilaDeEnvio();
  if (pendentes.length === 0) return;

  const aba = await encontrarAbaDoWhatsApp();
  if (!aba) {
    console.warn("[Legaus] Há mensagens pendentes, mas nenhuma aba do WhatsApp Web está aberta.");
    return;
  }

  for (const item of pendentes) {
    try {
      const resultado = await chrome.tabs.sendMessage(aba.id, {
        type: "LEGAUS_ENVIAR_MENSAGEM",
        payload: { telefone: item.telefone, texto: item.texto, mensagemId: item.mensagemId },
      });
      if (resultado?.ok) {
        await confirmarEnvio(item.mensagemId, resultado.externalId);
      }
      // se `resultado.motivo === "navegando"`, a próxima rodada do alarme tenta de novo
    } catch (erro) {
      console.error("[Legaus] Falha ao repassar mensagem pro content script:", erro);
    }
  }
}

chrome.runtime.onMessage.addListener((mensagem, _sender, sendResponse) => {
  if (mensagem.type === "LEGAUS_MENSAGEM_RECEBIDA") {
    reportarMensagemRecebida(mensagem.payload).then(sendResponse);
    return true;
  }
  if (mensagem.type === "LEGAUS_API_CALL") {
    chamarApiComDetalhes(mensagem.caminho, mensagem.options).then(sendResponse);
    return true;
  }
});

chrome.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name === ALARME_FILA_ENVIO) {
    processarFilaDeEnvio();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARME_FILA_ENVIO, { periodInMinutes: 1 });
});
