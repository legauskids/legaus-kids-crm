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

  // Pareamento por código (alternativa ao QR) — pedido uma vez só, assim
  // que o socket existe. NÃO testado ao vivo ainda (não tive como escanear
  // nem digitar código de verdade nesta sessão) — se `requestPairingCode`
  // der erro aqui, o fallback é usar o QR normal (não preencher
  // WHATSAPP_PAREAMENTO_TELEFONE no .env).
  if (TELEFONE_PAREAMENTO && !state.creds.registered) {
    setTimeout(async () => {
      try {
        const codigo = await sock.requestPairingCode(TELEFONE_PAREAMENTO);
        console.log(`\n[whatsapp-service] Código de pareamento: ${codigo}`);
        console.log(
          'No celular: WhatsApp Business > três pontinhos (ou Configurações) > Aparelhos conectados > Conectar um aparelho > "Conectar com número de telefone" > digite esse código.\n',
        );
      } catch (erro) {
        console.error("[whatsapp-service] Falha ao pedir código de pareamento:", erro.message);
      }
    }, 3000);
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
      console.log("[whatsapp-service] Conectado! Sincronizando com o CRM.");
      ligarRelayDeEntrada(sock);
      iniciarRelayDeSaida(sock);
    }

    if (connection === "close") {
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
