import "dotenv/config";
import fs from "node:fs";
import pino from "pino";
import qrcodeTerminal from "qrcode-terminal";
import qrcode from "qrcode";
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import { ligarRelayDeEntrada } from "./relay-entrada.js";
import { iniciarRelayDeSaida } from "./relay-saida.js";

const ARQUIVO_QR = "ultimo-qr.png";

const logger = pino({ level: "warn" });
const PASTA_AUTH = "auth";

// Se preenchido no .env, pareia por código de 8 dígitos (digitado no
// WhatsApp) em vez de QR code — mais tolerante a atraso do que escanear,
// já que não depende de câmera nem de a imagem chegar a tempo antes do
// código expirar. Só dígitos, com DDI (ex.: 5555999999999).
const TELEFONE_PAREAMENTO = process.env.WHATSAPP_PAREAMENTO_TELEFONE || "";

let credsAtuais = null;
let reconexaoAgendada = false;

// Visto ao vivo em 2026-08-27: a conexão às vezes fica "zumbi" — o processo
// continua rodando, o WebSocket nem sempre dispara connection.update:"close"
// (o Baileys engole o erro internamente, ex. "unexpected error in 'init
// queries'" / timeout de fetchProps), e nada mais chega dali pra frente.
// Sem isso o serviço parecia "ligado" por horas sem sincronizar nada. Uma
// prova de vida periódica (pedido leve e real pro WhatsApp, com timeout
// próprio) detecta esse travamento e força a reconexão.
const INTERVALO_PROVA_DE_VIDA_MS = 3 * 60 * 1000;
const TIMEOUT_PROVA_DE_VIDA_MS = 20 * 1000;
let watchdogInterval = null;

function pararWatchdog() {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
}

function iniciarWatchdog(sock) {
  pararWatchdog();
  watchdogInterval = setInterval(async () => {
    try {
      await Promise.race([
        sock.sendPresenceUpdate("available"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("sem resposta do WhatsApp")), TIMEOUT_PROVA_DE_VIDA_MS),
        ),
      ]);
    } catch (erro) {
      console.error(
        `[whatsapp-service] Watchdog: conexão travada (${erro.message}) — forçando reconexão.`,
      );
      try {
        sock.ev.removeAllListeners();
        sock.end(new Error("watchdog: conexão travada"));
      } catch {
        // sock já pode estar inutilizável nesse ponto — segue pra reconectar de qualquer jeito.
      }
      agendarReconexao();
    }
  }, INTERVALO_PROVA_DE_VIDA_MS);
}

/**
 * Só apaga auth/ se as credenciais NUNCA chegaram a se registrar de
 * verdade (`creds.registered`) — checagem pelo próprio estado persistido,
 * não por uma flag "cheguei a abrir a conexão nesta execução". Isso importa
 * porque, logo depois de um pareamento bem-sucedido (QR escaneado ou código
 * digitado), o WhatsApp fecha a conexão de propósito com stream-error 515
 * pra forçar reconectar com a sessão nova — ANTES do "connection: open"
 * disparar. Apagar auth/ nesse momento (visto ao vivo em 2026-08-24)
 * destrói um pareamento que tinha acabado de dar certo, empurrando o
 * serviço pra um loop de "parear de novo, apagar nossa própria sessão boa,
 * parear de novo...". Só é seguro apagar quando `registered` continua
 * false — aí sim é um handshake que nunca terminou (QR nunca escaneado,
 * ou dados realmente corrompidos no meio do processo).
 */
function limparAuthSeNaoRegistrado() {
  if (credsAtuais && !credsAtuais.registered && fs.existsSync(PASTA_AUTH)) {
    fs.rmSync(PASTA_AUTH, { recursive: true, force: true });
    console.warn("[whatsapp-service] Pareamento nunca completou — apagando e gerando um QR code/código novo.");
  }
}

function agendarReconexao() {
  pararWatchdog();
  if (reconexaoAgendada) return;
  reconexaoAgendada = true;
  limparAuthSeNaoRegistrado();
  console.warn("[whatsapp-service] Reconectando em instantes...");
  setTimeout(() => {
    reconexaoAgendada = false;
    conectar();
  }, 2000);
}

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState(PASTA_AUTH);
  credsAtuais = state.creds;
  // Busca a versão mais recente do protocolo do WhatsApp Web em vez de usar
  // a que veio empacotada no Baileys — versão desatualizada é uma causa
  // comum de "não foi possível conectar" ao escanear o QR.
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({ auth: state, logger, version });

  sock.ev.on("creds.update", saveCreds);

  // Pareamento por código (alternativa ao QR). Diferente do QR — que o
  // próprio Baileys renova sozinho a cada conexão.update —, um código pedido
  // uma vez só ficava velho (~60s) e exigia reiniciar o processo à mão pra
  // gerar outro (visto ao vivo em 2026-08-24, foi preciso reiniciar várias
  // vezes manualmente). Agora pede um novo periodicamente até conectar de
  // verdade, sem precisar reiniciar nada.
  let intervaloCodigo = null;
  if (TELEFONE_PAREAMENTO && !state.creds.registered) {
    const pedirCodigo = async () => {
      try {
        const codigo = await sock.requestPairingCode(TELEFONE_PAREAMENTO);
        console.log(`\n[whatsapp-service] Código de pareamento: ${codigo}`);
        console.log(
          'No celular: WhatsApp Business > três pontinhos (ou Configurações) > Aparelhos conectados > Conectar um aparelho > "Conectar com número de telefone" > digite esse código.\n',
        );
      } catch (erro) {
        console.error("[whatsapp-service] Falha ao pedir código de pareamento:", erro.message);
      }
    };
    setTimeout(pedirCodigo, 3000);
    intervaloCodigo = setInterval(pedirCodigo, 50000);
  }

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !TELEFONE_PAREAMENTO) {
      console.log(
        "\nEscaneie esse QR code pelo WhatsApp Business do celular (Aparelhos conectados > Conectar um aparelho):\n",
      );
      qrcodeTerminal.generate(qr, { small: true });
      // Também salva como imagem — o desenho em texto acima pode distorcer
      // dependendo de onde é exibido (chat, terminal com fonte diferente),
      // a imagem é a versão confiável pra escanear de verdade.
      qrcode.toFile(ARQUIVO_QR, qr, { width: 500 }).catch((erro) => {
        console.error("[whatsapp-service] Falha ao salvar QR como imagem:", erro.message);
      });
    }

    if (connection === "open") {
      if (intervaloCodigo) clearInterval(intervaloCodigo);
      console.log("[whatsapp-service] Conectado! Sincronizando com o CRM.");
      ligarRelayDeEntrada(sock);
      iniciarRelayDeSaida(sock);
      iniciarWatchdog(sock);
    }

    if (connection === "close") {
      if (intervaloCodigo) clearInterval(intervaloCodigo);
      const codigo = lastDisconnect?.error?.output?.statusCode;
      const deslogado = codigo === DisconnectReason.loggedOut;
      if (deslogado) {
        console.error(
          "[whatsapp-service] Sessão desconectada pelo celular — apague a pasta auth/ e rode `npm start` de novo pra parear outra vez.",
        );
        process.exit(1);
      }
      agendarReconexao();
    }
  });
}

// Rede de segurança: erros que o Baileys joga direto num callback de evento
// (fora de qualquer Promise que o try/catch normal conseguiria pegar) —
// como o crash de handshake corrompido — derrubavam o processo inteiro
// (Node mata o processo por padrão em exceção não capturada). Agora, em
// vez de morrer, tenta reconectar do mesmo jeito que uma queda de conexão
// normal.
process.on("uncaughtException", (erro) => {
  console.error("[whatsapp-service] Erro inesperado:", erro.message);
  agendarReconexao();
});

process.on("unhandledRejection", (erro) => {
  console.error("[whatsapp-service] Falha não tratada:", erro?.message ?? erro);
  agendarReconexao();
});

conectar().catch((erro) => {
  console.error("[whatsapp-service] Erro fatal ao iniciar:", erro);
  process.exit(1);
});
