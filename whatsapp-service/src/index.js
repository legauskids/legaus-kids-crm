import "dotenv/config";
import fs from "node:fs";
import pino from "pino";
import qrcodeTerminal from "qrcode-terminal";
import qrcode from "qrcode";
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import { ligarRelayDeEntrada } from "./relay-entrada.js";
import { iniciarRelayDeSaida } from "./relay-saida.js";
import { ligarRelayDeComandoAgente } from "./relay-comando-agente.js";
import { aprenderDeContatos, registrarMapeamento } from "./lid-cache.js";
import { avisar } from "./alertas.js";

const ARQUIVO_QR = "ultimo-qr.png";
const ARQUIVO_ESTADO = "estado-saude.json";

// Estado lido por um watchdog EXTERNO (cron na VPS, fora deste processo) —
// existe porque um watchdog só de dentro do próprio processo não detecta o
// caso em que o processo inteiro trava e nem o setInterval do watchdog
// interno consegue mais rodar. "em" fica em ISO 8601 pra dar pra comparar
// "há quanto tempo" de fora sem precisar entender fuso.
function escreverEstado(status) {
  try {
    fs.writeFileSync(ARQUIVO_ESTADO, JSON.stringify({ status, em: new Date().toISOString() }));
  } catch (erro) {
    console.error("[whatsapp-service] Falha ao escrever estado de saúde:", erro.message);
  }
}

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
// Era 3 minutos — apertado pra 1 depois de ver ao vivo em 2026-09-06 que 3
// minutos de espera parada (sem processar nada) é tempo demais quando o
// Marcos está usando de verdade: ele já tinha notado e me avisado antes do
// watchdog sequer detectar o travamento sozinho.
const INTERVALO_PROVA_DE_VIDA_MS = 60 * 1000;
const TIMEOUT_PROVA_DE_VIDA_MS = 20 * 1000;
let watchdogInterval = null;

function pararWatchdog() {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
}

// Prova de vida real precisa de round-trip até o servidor do WhatsApp e
// resposta de volta — sendPresenceUpdate (usado antes) só escreve a
// stanza no socket local e resolve, sem esperar confirmação nenhuma do
// outro lado; por isso o watchdog nunca detectava uma conexão zumbi de
// verdade (visto ao vivo em 2026-09-06: mais de 20min parado sem nenhum
// aviso de "conexão travada"). onWhatsApp() exige resposta do servidor
// pra existir (é como o resto do código já resolve telefone -> LID em
// outros lugares), então serve como prova de vida de verdade.
function numeroParaProvaDeVida(sock) {
  if (TELEFONE_PAREAMENTO) return TELEFONE_PAREAMENTO;
  const idProprio = sock.user?.id || "";
  return idProprio.split(":")[0].split("@")[0] || null;
}

function iniciarWatchdog(sock) {
  pararWatchdog();
  watchdogInterval = setInterval(async () => {
    try {
      const numero = numeroParaProvaDeVida(sock);
      if (!numero) throw new Error("sem número pra testar");
      await Promise.race([
        sock.onWhatsApp(numero),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("sem resposta do WhatsApp")), TIMEOUT_PROVA_DE_VIDA_MS),
        ),
      ]);
    } catch (erro) {
      console.error(
        `[whatsapp-service] Watchdog: conexão travada (${erro.message}) — forçando reconexão.`,
      );
      // Marca "reconectando" aqui, não só no handler de connection.update:close
      // — é exatamente esse tipo de trava que o watchdog interno existe pra
      // pegar, e sock.end() nem sempre dispara o evento close (mesmo motivo
      // pelo qual o watchdog existe, ver comentário acima).
      escreverEstado("reconectando");
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

/**
 * O celular pessoal do Marcos (mesmo número usado pro pareamento por
 * código, `WHATSAPP_PAREAMENTO_TELEFONE`) é justamente quem ele testa
 * mandando mensagem do WhatsApp da Legaus Kids pra si mesmo — e é
 * exatamente esse tipo de conversa (self-chat entre dois números do
 * mesmo ecossistema) que mais aparece endereçada por LID em vez de
 * telefone. Como já SABEMOS o telefone real, dá pra resolver o LID dele
 * de forma proativa aqui (telefone -> LID é a direção que o Baileys
 * suporta de verdade, via onWhatsApp/USync) em vez de esperar passivamente
 * a sincronização de contatos aprender essa correspondência sozinha.
 */
async function resolverLidDoProprioNumero(sock) {
  if (!TELEFONE_PAREAMENTO) return;
  try {
    const resultados = await sock.onWhatsApp(TELEFONE_PAREAMENTO);
    for (const r of resultados ?? []) {
      if (r.lid) registrarMapeamento(r.lid, TELEFONE_PAREAMENTO);
    }
  } catch (erro) {
    console.error("[whatsapp-service] Falha ao resolver LID do próprio número:", erro.message);
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

  const sock = makeWASocket({
    auth: state,
    logger,
    version,
    // Achado ao vivo em 2026-08-27/28: fireInitQueries (ligado por padrão)
    // dispara fetchProps+fetchBlocklist+fetchPrivacySettings só pra manter
    // paridade com o WhatsApp Web — nada que esse serviço usa, já que só
    // relê mensagem de texto pro CRM. Numa das contas isso passou a travar
    // (timeout) toda vez que conectava, derrubando a conexão de novo em
    // segundos e entrando num loop de reconexão de ~1x por minuto, por
    // horas — sem nenhum bloqueio real da conta (confirmado: os outros
    // aparelhos vinculados continuaram funcionando normalmente o tempo
    // todo). Desligar isso evita a causa, não só o sintoma.
    fireInitQueries: false,
  });

  sock.ev.on("creds.update", saveCreds);

  // Aprende a correspondência LID -> telefone real conforme o Baileys vai
  // sincronizando contatos (normalmente logo após conectar) — usado por
  // relay-entrada.js pra resolver mensagens que chegam com LID no lugar do
  // telefone (ver lid-cache.js pro porquê disso ser necessário).
  sock.ev.on("contacts.upsert", aprenderDeContatos);
  sock.ev.on("contacts.update", aprenderDeContatos);

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

  sock.ev.on("connection.update", async (update) => {
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
      escreverEstado("conectado");
      ligarRelayDeEntrada(sock);
      iniciarRelayDeSaida(sock);
      ligarRelayDeComandoAgente(sock);
      iniciarWatchdog(sock);
      resolverLidDoProprioNumero(sock);
    }

    if (connection === "close") {
      if (intervaloCodigo) clearInterval(intervaloCodigo);
      const codigo = lastDisconnect?.error?.output?.statusCode;
      const deslogado = codigo === DisconnectReason.loggedOut;
      if (deslogado) {
        console.error(
          "[whatsapp-service] Sessão desconectada pelo celular — apague a pasta auth/ e rode `npm start` de novo pra parear outra vez.",
        );
        escreverEstado("desconectado_permanente");
        // Espera o envio terminar antes de derrubar o processo — sem isso o
        // process.exit mata a chamada de rede assíncrona no meio do caminho
        // e o alerta nunca sai de verdade.
        await avisar(
          "WhatsApp Legaus Kids desconectado",
          "A sessão foi desconectada pelo celular (ou removida em Aparelhos conectados). Precisa parear de novo — sem isso, mensagens não chegam nem saem.",
          { prioridade: "urgent", tag: "rotating_light" },
        );
        process.exit(1);
      }
      escreverEstado("reconectando");
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
