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

let jaConectouUmaVez = false;
let reconexaoAgendada = false;

/**
 * Se a conexão cair/travar ANTES de terminar de parear (nunca chegou a
 * "open" nesta execução), o estado salvo em auth/ pode ter ficado num
 * meio-termo inconsistente do handshake — reconectar reaproveitando esse
 * estado corrompido é o que gera o crash "Unsupported state or unable to
 * authenticate data" (visto ao vivo em 2026-08-24: o QR caiu no meio do
 * pareamento e a reconexão automática travou o processo inteiro). Mais
 * seguro apagar e começar do zero (gera um QR code novo) do que insistir
 * num estado que já provou estar quebrado. Depois que parear de verdade
 * (connection: open ao menos uma vez), reconexões normais reaproveitam
 * auth/ sem problema.
 */
function limparAuthSeNuncaPareou() {
  if (!jaConectouUmaVez && fs.existsSync(PASTA_AUTH)) {
    fs.rmSync(PASTA_AUTH, { recursive: true, force: true });
    console.warn("[whatsapp-service] Estado de pareamento incompleto — apagando e gerando um QR code novo.");
  }
}

function agendarReconexao() {
  if (reconexaoAgendada) return;
  reconexaoAgendada = true;
  limparAuthSeNuncaPareou();
  console.warn("[whatsapp-service] Reconectando em instantes...");
  setTimeout(() => {
    reconexaoAgendada = false;
    conectar();
  }, 2000);
}

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState(PASTA_AUTH);
  // Busca a versão mais recente do protocolo do WhatsApp Web em vez de usar
  // a que veio empacotada no Baileys — versão desatualizada é uma causa
  // comum de "não foi possível conectar" ao escanear o QR.
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({ auth: state, logger, version });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
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
      jaConectouUmaVez = true;
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
