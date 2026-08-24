import "dotenv/config";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import { ligarRelayDeEntrada } from "./relay-entrada.js";
import { iniciarRelayDeSaida } from "./relay-saida.js";

const logger = pino({ level: "warn" });

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");

  const sock = makeWASocket({ auth: state, logger });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(
        "\nEscaneie esse QR code pelo WhatsApp Business do celular (Aparelhos conectados > Conectar um aparelho):\n",
      );
      qrcode.generate(qr, { small: true });
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
      console.warn("[whatsapp-service] Conexão caiu, reconectando em instantes...");
      setTimeout(conectar, 2000);
    }
  });
}

conectar().catch((erro) => {
  console.error("[whatsapp-service] Erro fatal ao iniciar:", erro);
  process.exit(1);
});
