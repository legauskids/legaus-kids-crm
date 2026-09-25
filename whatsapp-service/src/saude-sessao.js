import { proto } from "@whiskeysockets/baileys";
import { avisar } from "./alertas.js";

// Visto ao vivo em 2026-09-25 no servidor da Legaus: depois de o computador
// acordar de uma suspensão de 9h, a sessão criptografada (Signal) entre este
// aparelho e o celular principal da Legaus quebrou. Toda mensagem vinda do
// próprio celular (fromMe — o que é mandado direto pelo celular, e os
// comandos por self-chat) passou a falhar com "Bad MAC" / "No matching
// sessions", ~12 a 25 por minuto, e o Baileys entrou num loop de pedir
// reenvio ao celular. Mensagens de clientes continuaram normais, então nada
// parecia errado — ficou quase 1h30 assim até alguém olhar o log. Apagar o
// arquivo da sessão não curou; o que resolveu foi parear de novo.
//
// O Baileys não derruba nada nesse caso: ele entrega a mensagem que não
// conseguiu abrir como um "stub" CIPHERTEXT no messages.upsert. Aqui só
// contamos esses stubs de mensagens fromMe e avisamos (um alerta por
// episódio) quando passam do limite — poucas falhas soltas logo depois de
// parear ou reconectar são normais e se resolvem sozinhas.
const JANELA_MS = 10 * 60 * 1000;
const LIMITE_FALHAS_NA_JANELA = 20;
// Episódio encerrado depois de tanto tempo sem nenhuma falha — só então um
// novo loop gera um novo alerta (senão vira spam a cada falha).
const SILENCIO_ENCERRA_EPISODIO_MS = 30 * 60 * 1000;

let falhasRecentes = [];
let ultimaFalhaEm = 0;
let alertaEnviado = false;

function registrarFalha() {
  const agora = Date.now();
  if (alertaEnviado && agora - ultimaFalhaEm > SILENCIO_ENCERRA_EPISODIO_MS) {
    alertaEnviado = false;
  }
  ultimaFalhaEm = agora;
  falhasRecentes = falhasRecentes.filter((t) => agora - t <= JANELA_MS);
  falhasRecentes.push(agora);

  if (falhasRecentes.length >= LIMITE_FALHAS_NA_JANELA && !alertaEnviado) {
    alertaEnviado = true;
    console.error(
      `[saude-sessao] ${falhasRecentes.length} mensagens do próprio WhatsApp da Legaus não puderam ser descriptografadas em 10 min — a sessão com o celular quebrou. Precisa parear de novo.`,
    );
    avisar(
      "WhatsApp Legaus: sessão com o celular quebrada",
      "Mensagens enviadas pelo celular da Legaus (e comandos por self-chat) não estão chegando ao CRM — o servidor não consegue descriptografá-las. Mensagens de clientes continuam funcionando. Para corrigir: parear de novo pelo QR code no servidor.",
      { prioridade: "high", tag: "warning" },
    );
  }
}

export function ligarDetectorDeSessaoQuebrada(sock) {
  sock.ev.on("messages.upsert", ({ messages }) => {
    for (const msg of messages) {
      if (msg.messageStubType !== proto.WebMessageInfo.StubType.CIPHERTEXT) continue;
      if (!msg.key?.fromMe) continue;
      registrarFalha();
    }
  });
}
