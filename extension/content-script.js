// Content script injetado em https://web.whatsapp.com/*
// Depende de LEGAUS_SELECTORS / primeiroElemento / todosElementos / contarCandidatos,
// definidos em selectors.js (carregado antes deste arquivo, mesmo "isolated world").

const mensagensJaEnviadas = new Set();
const telefonePorConversaAberta = new Map(); // telefone -> conversaId (preenchido pelas respostas do backend)

let telefoneAtual = null;
let cabecalhoAtualTexto = null;

function log(...args) {
  console.log("[Legaus]", ...args);
}

function normalizarTelefone(texto) {
  const digitos = (texto || "").replace(/\D/g, "");
  return digitos.length >= 10 ? digitos : null;
}

/**
 * Descobre o telefone da conversa atualmente aberta.
 * Caminho rápido: o aria-label da caixa de composição já é o telefone
 * quando o contato não tem nome salvo ("Digite uma mensagem para 5511...").
 * Caminho lento (contato com nome salvo): abre o painel de dados do
 * contato, lê a seção "Recado e número de telefone" e fecha de novo —
 * é a parte mais sujeita a precisar de ajuste fino numa sessão real,
 * porque mexe na UI em vez de só ler.
 */
async function obterTelefoneDaConversaAberta() {
  const caixa = primeiroElemento(LEGAUS_SELECTORS.caixaComposicao);
  const ariaLabel = caixa?.getAttribute("aria-label") ?? "";
  const match = ariaLabel.match(/para\s+(.+)$/i);
  const candidato = match ? normalizarTelefone(match[1]) : null;
  if (candidato) return candidato;

  // Nome salvo — precisa abrir o painel de dados do contato.
  const cabecalho = primeiroElemento(LEGAUS_SELECTORS.cabecalhoConversa);
  if (!cabecalho) return null;

  cabecalho.click();
  await new Promise((resolve) => setTimeout(resolve, 600));

  const secao = primeiroElemento(LEGAUS_SELECTORS.secaoTelefoneContato);
  let telefone = null;
  if (secao?.parentElement) {
    const spans = secao.parentElement.querySelectorAll("span");
    for (const span of spans) {
      const possivel = normalizarTelefone(span.textContent);
      if (possivel) {
        telefone = possivel;
        break;
      }
    }
  }

  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  return telefone;
}

async function telefoneDaConversaAtual() {
  const cabecalho = primeiroElemento(LEGAUS_SELECTORS.tituloCabecalho);
  const textoCabecalho = cabecalho?.textContent ?? "";
  if (textoCabecalho && textoCabecalho === cabecalhoAtualTexto && telefoneAtual) {
    return telefoneAtual;
  }
  cabecalhoAtualTexto = textoCabecalho;
  telefoneAtual = await obterTelefoneDaConversaAberta();
  return telefoneAtual;
}

function extrairTextoMensagem(bolha) {
  const textoEl = primeiroElemento(LEGAUS_SELECTORS.textoMensagem, bolha);
  return textoEl?.textContent?.trim() ?? "";
}

function direcaoDaMensagem(bolha) {
  if (primeiroElemento(LEGAUS_SELECTORS.caudaEnviada, bolha)) return "SAIDA";
  if (primeiroElemento(LEGAUS_SELECTORS.caudaRecebida, bolha)) return "ENTRADA";
  return null; // mensagem de sistema, figurinha sem cauda visível, etc. — ignora
}

async function reportarMensagem(payload) {
  if (mensagensJaEnviadas.has(payload.externalId)) return;
  mensagensJaEnviadas.add(payload.externalId);

  const resposta = await chrome.runtime.sendMessage({ type: "LEGAUS_MENSAGEM_RECEBIDA", payload });
  if (resposta?.conversaId) {
    telefonePorConversaAberta.set(payload.telefone, resposta.conversaId);
    atualizarBadge(payload.telefone);
  }
}

async function processarBolha(bolha) {
  const externalId = bolha.getAttribute("data-testid");
  if (!externalId || mensagensJaEnviadas.has(externalId)) return;

  const direcao = direcaoDaMensagem(bolha);
  if (!direcao) return;

  const texto = extrairTextoMensagem(bolha);
  if (!texto) return;

  const telefone = await telefoneDaConversaAtual();
  if (!telefone) {
    log("Não consegui identificar o telefone da conversa aberta — ver selectors.js / obterTelefoneDaConversaAberta().");
    return;
  }

  reportarMensagem({ telefone, texto, direcao, externalId, enviadaEm: new Date().toISOString() });
}

function observarPainelDeMensagens() {
  const painel = primeiroElemento(LEGAUS_SELECTORS.painelMensagens);
  if (!painel || painel.dataset.legausObservado) return;
  painel.dataset.legausObservado = "true";

  todosElementos(LEGAUS_SELECTORS.bolhaMensagem, painel).forEach(processarBolha);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches?.(LEGAUS_SELECTORS.bolhaMensagem.join(","))) {
          processarBolha(node);
        } else {
          todosElementos(LEGAUS_SELECTORS.bolhaMensagem, node).forEach(processarBolha);
        }
      }
    }
  });
  observer.observe(painel, { childList: true, subtree: true });
  log("Observando painel de mensagens.");
}

function injetarBadge() {
  const cabecalho = primeiroElemento(LEGAUS_SELECTORS.cabecalhoConversa);
  if (!cabecalho || cabecalho.querySelector(".legaus-badge")) return;

  const badge = document.createElement("a");
  badge.className = "legaus-badge";
  badge.textContent = "Abrir no CRM";
  badge.target = "_blank";
  badge.rel = "noopener";
  chrome.storage.local.get(["apiUrl"], ({ apiUrl }) => {
    badge.href = `${apiUrl || "http://localhost:3000"}/atendimento`;
  });
  cabecalho.appendChild(badge);
}

function atualizarBadge(telefone) {
  const conversaId = telefonePorConversaAberta.get(telefone);
  const badge = document.querySelector(".legaus-badge");
  if (badge && conversaId) {
    chrome.storage.local.get(["apiUrl"], ({ apiUrl }) => {
      badge.href = `${apiUrl || "http://localhost:3000"}/atendimento?conversaId=${conversaId}`;
    });
  }
}

function iniciarObservacaoDaConversaAberta() {
  const areaPrincipal = document.querySelector("#main")?.parentElement ?? document.body;
  const observer = new MutationObserver(() => {
    observarPainelDeMensagens();
    injetarBadge();
  });
  observer.observe(areaPrincipal, { childList: true, subtree: true });
  observarPainelDeMensagens();
  injetarBadge();
}

/** Localiza a caixa de composição e dispara os eventos que o React do WhatsApp Web espera. */
function digitarNaCaixaDeComposicao(texto) {
  const caixa = primeiroElemento(LEGAUS_SELECTORS.caixaComposicao);
  if (!caixa) return false;

  caixa.focus();
  document.execCommand("selectAll", false, undefined);
  document.execCommand("delete", false, undefined);
  document.execCommand("insertText", false, texto);
  return true;
}

function clicarEnviar() {
  const botao = primeiroElemento(LEGAUS_SELECTORS.botaoEnviar);
  if (!botao) return false;
  botao.click();
  return true;
}

async function enviarMensagemReal({ telefone, texto, mensagemId }) {
  if (!location.href.includes(`phone=${telefone}`)) {
    location.href = `https://web.whatsapp.com/send?phone=${telefone}`;
    // a navegação recarrega o content script; o background reencaminha o comando
    // de novo na próxima rodada do alarme (1 min) — ver background.js.
    return { ok: false, motivo: "navegando" };
  }

  await new Promise((resolve) => setTimeout(resolve, 1500)); // dá tempo da conversa carregar

  const digitou = digitarNaCaixaDeComposicao(texto);
  if (!digitou) return { ok: false, motivo: "caixa de composição não encontrada — ver selectors.js" };

  await new Promise((resolve) => setTimeout(resolve, 200)); // o botão de enviar só aparece depois de digitar

  const enviou = clicarEnviar();
  if (!enviou) return { ok: false, motivo: "botão de enviar não encontrado — ver selectors.js" };

  return { ok: true, mensagemId, externalId: `local-send-${telefone}-${Date.now()}` };
}

chrome.runtime.onMessage.addListener((mensagem, _sender, sendResponse) => {
  if (mensagem.type === "LEGAUS_ENVIAR_MENSAGEM") {
    enviarMensagemReal(mensagem.payload).then(sendResponse);
    return true; // resposta assíncrona
  }
});

/** Roda todos os seletores contra o DOM atual e reporta no console. Chame window.__legausDebug(). */
function diagnostico() {
  const resultado = {};
  for (const [nome, seletores] of Object.entries(LEGAUS_SELECTORS)) {
    resultado[nome] = contarCandidatos(seletores);
  }
  console.table(resultado);
  return resultado;
}
window.__legausDebug = diagnostico;

function iniciar() {
  const logado = primeiroElemento(LEGAUS_SELECTORS.appLogado);
  if (!logado) {
    log("Tela de QR code detectada (ou seletores desatualizados) — aguardando login.");
    setTimeout(iniciar, 3000);
    return;
  }
  log("WhatsApp Web logado. Iniciando sincronização.");
  iniciarObservacaoDaConversaAberta();
}

iniciar();
