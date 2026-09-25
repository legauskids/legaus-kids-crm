import "dotenv/config";
import fs from "node:fs";
import pino from "pino";
import qrcodeTerminal from "qrcode-terminal";
import qrcode from "qrcode";
import { makeWASocket, DisconnectReason, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import { useAuthStateAtomico } from "./auth-state-atomico.js";
import { ligarDetectorDeSessaoQuebrada } from "./saude-sessao.js";
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

// Achado ao vivo em 2026-09-13 analisando os logs minuto a minuto: mesmo
// depois de subir CONEXAO_ESTAVEL_MS pra 90s, o padrão de conflito
// continuou idêntico — e "Conectado!" e "Reconectando tentativa N"
// apareciam no MESMO segundo, repetidas vezes. Ou seja, a conexão nem
// chegava a sobreviver os 15-17s estimados antes: tinha mais de um socket
// Baileys vivo ao mesmo tempo dentro do processo. `conectar()` nunca
// derruba de vez os listeners do socket anterior no caminho normal de
// fechamento (só o watchdog de zumbi fazia isso, e só depois de um tempo
// sem heartbeat) — então um `connection.update` atrasado do socket velho
// podia disparar `agendarReconexao()` de novo por cima do socket novo,
// os dois brigando pelo mesmo `conectadoDesde`/`tentativasReconexaoSeguidas`
// compartilhado. Esse guard garante que só o socket mais recente (o
// "atual") pode mexer nesse estado — qualquer evento de um socket já
// substituído é ignorado.
let sockAtual = null;

// Visto ao vivo em 2026-09-10/12: sem backoff, um "conflict: replaced" (o
// WhatsApp fecha dizendo que outra conexão substituiu essa) virava um
// loop que se sustentava sozinho por DIAS — reconectar de novo em só 2s
// não dava tempo do servidor terminar de derrubar a conexão anterior do
// lado dele, então a conexão nova era lida como "mais uma duplicata" e
// fechada de novo, pra sempre. Backoff exponencial (2s, 4s, 8s... até
// 60s) dá esse tempo. Só reseta pra 2s de novo depois de ficar conectado
// de verdade por um tempo mínimo — sem isso, o "Conectado!" que aparece
// bem antes de cada conflito (a conexão SEMPRE abre brevemente antes de
// ser derrubada) zeraria o contador a cada ciclo e o backoff nunca cresceria.
//
// Corrigido de novo em 2026-09-13: 15s de "estável" ainda era curto
// demais — visto ao vivo um novo episódio (77 mil conflitos em 3h,
// pior que o de dias atrás) onde a conexão ficava de pé por ~16-17s
// antes de cair de novo, o suficiente pra resetar o contador e o
// backoff nunca escalar de verdade, ficando preso girando entre 2s e
// 16s pra sempre em vez de chegar nos 60s que realmente ajudam.
// Subido pra 90s — só considera "resolvido" uma conexão que durou bem
// mais que qualquer uma das quedas rápidas já vistas.
const BACKOFF_BASE_MS = 2000;
const BACKOFF_MAX_MS = 60 * 1000;
const CONEXAO_ESTAVEL_MS = 90 * 1000;
let tentativasReconexaoSeguidas = 0;
let conectadoDesde = null;

// Aviso proativo pra quando o backoff já escalou bastante e ainda não
// resolveu — sem isso, uma instabilidade dessas só aparecia pro Marcos
// quando ele reparasse sozinho (ou o watchdog externo via cron, que pode
// demorar a bater o limiar dele). Um por episódio (reseta quando a
// conexão finalmente fica estável de novo), pra não virar spam.
const TENTATIVAS_PARA_ALERTA = 6;
let alertaDeInstabilidadeEnviado = false;

function calcularAtrasoReconexao() {
  const atraso = Math.min(BACKOFF_BASE_MS * 2 ** tentativasReconexaoSeguidas, BACKOFF_MAX_MS);
  tentativasReconexaoSeguidas++;
  return atraso;
}

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
 * Pareado de verdade = `registered` OU `account`. Achado ao vivo em
 * 2026-09-24 (primeiro pareamento por QR no servidor da Legaus): o Baileys
 * só marca `registered = true` no pareamento por CÓDIGO (messages-recv.js,
 * etapa companion_finish). No pareamento por QR, o `pair-success` grava
 * `account`/`me` mas nunca `registered` — checar só `registered` fazia o
 * 515 logo depois de escanear o QR apagar a sessão que tinha acabado de
 * dar certo. `account` é gravado pelo `pair-success` nos dois fluxos.
 */
function estaPareado(creds) {
  return Boolean(creds?.registered || creds?.account);
}

/**
 * Só apaga auth/ se as credenciais NUNCA chegaram a se registrar de
 * verdade (`estaPareado`) — checagem pelo próprio estado persistido,
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
  if (credsAtuais && !estaPareado(credsAtuais) && fs.existsSync(PASTA_AUTH)) {
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

  if (conectadoDesde && Date.now() - conectadoDesde >= CONEXAO_ESTAVEL_MS) {
    tentativasReconexaoSeguidas = 0;
    alertaDeInstabilidadeEnviado = false;
  }
  conectadoDesde = null;

  const atraso = calcularAtrasoReconexao();
  console.warn(`[whatsapp-service] Reconectando em ${Math.round(atraso / 1000)}s (tentativa ${tentativasReconexaoSeguidas})...`);

  if (tentativasReconexaoSeguidas >= TENTATIVAS_PARA_ALERTA && !alertaDeInstabilidadeEnviado) {
    alertaDeInstabilidadeEnviado = true;
    avisar(
      "WhatsApp Legaus Kids instável",
      `Reconectando repetidamente há um tempo sem estabilizar (tentativa ${tentativasReconexaoSeguidas}) — mensagens podem estar atrasando. Se continuar por muito tempo, dá uma olhada.`,
      { prioridade: "high", tag: "warning" },
    );
  }

  setTimeout(() => {
    reconexaoAgendada = false;
    conectar();
  }, atraso);
}

async function conectar() {
  // Gravação atômica em vez do useMultiFileAuthState do Baileys — ver
  // auth-state-atomico.js (mesma pasta e mesmos arquivos, compatível).
  const { state, saveCreds } = await useAuthStateAtomico(PASTA_AUTH);
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
    // Desliga o "placeholder resend" (pedir ao celular, via mensagem peer,
    // pra reenviar o conteúdo de uma mensagem que não abriu). Achado ao vivo
    // em 2026-09-25, reproduzido 3 vezes: depois de reconectar, o WhatsApp
    // reentrega mensagens de outro aparelho da conta que já tinham sido
    // abertas ("Key used already") -> 5s depois o Baileys 6.7 manda o pedido
    // de reenvio pro celular endereçado pelo NÚMERO (creds.me.id), mas o
    // resto da conversa com os próprios aparelhos é pelo LID -> sem sessão
    // pelo número, cria uma nova (pkmsg) -> o celular passa a usar essa
    // sessão nova e tudo que ele manda chega pelo LID com "Bad MAC" / "No
    // matching sessions", em loop, até parear de novo. Com o cache sempre
    // dizendo "já pedi", requestPlaceholderResend sai no começo e a
    // recuperação fica só com o retry receipt normal do Signal, direto com o
    // aparelho que mandou. Revisitar quando atualizar pro Baileys 7 (que
    // reescreveu o tratamento de LID).
    placeholderResendCache: {
      get: () => true,
      set: () => {},
      del: () => {},
      flushAll: () => {},
    },
  });
  sockAtual = sock;

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
  // `estaPareado` e não só `registered`: numa sessão pareada por QR,
  // `registered` fica false pra sempre, e pedir código aqui sobrescreveria
  // `creds.me` de uma sessão que já funciona.
  if (TELEFONE_PAREAMENTO && !estaPareado(state.creds)) {
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
    // Ignora evento de um socket já substituído por um `conectar()` mais
    // recente — ver comentário de `sockAtual` acima. Sem isso, um evento
    // atrasado do socket velho podia reagendar reconexão ou zerar/mexer no
    // estado compartilhado por cima do socket que já está de pé agora.
    if (sock !== sockAtual) return;

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
      conectadoDesde = Date.now();
      escreverEstado("conectado");
      ligarRelayDeEntrada(sock);
      iniciarRelayDeSaida(sock);
      ligarRelayDeComandoAgente(sock);
      ligarDetectorDeSessaoQuebrada(sock);
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
