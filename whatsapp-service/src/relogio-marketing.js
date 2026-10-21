// Relógio dos posts agendados do Marketing (etapa 3 dos posts, 2026-10-21).
// A Vercel não tem um "cron" de minuto em minuto no plano da Legaus, então
// quem bate o relógio é este serviço, que já fica ligado 24h no servidor:
// a cada minuto chama o CRM, que publica no Instagram/Facebook os posts cujo
// horário chegou (e testa a conexão com a Meta uma vez por dia).
//
// Não depende do WhatsApp estar conectado: começa junto com o processo e
// segue rodando mesmo se a sessão cair. Toda falha fica aqui dentro — uma
// rejeição solta derrubaria a sessão do WhatsApp (ver unhandledRejection no
// index.js).

import { chamarApi } from "./crm-api.js";

const INTERVALO_MS = 60_000;

let iniciado = false;
let rodando = false;
let ultimoErro = null;

async function bater() {
  // Publicar pode levar mais de um minuto: não começa outra rodada por cima.
  if (rodando) return;
  rodando = true;
  try {
    const r = await chamarApi("/api/integracoes/publicar-agendados", { method: "POST" });
    if (ultimoErro) console.log("[relogio-marketing] Voltou a funcionar.");
    ultimoErro = null;
    if (r?.publicados || r?.erros) console.log(`[relogio-marketing] Publicados: ${r.publicados ?? 0} · com erro: ${r.erros ?? 0}`);
  } catch (erro) {
    const mensagem = erro?.message ?? String(erro);
    // Mesma falha a cada minuto (CRM fora do ar, por exemplo): loga uma vez só.
    if (mensagem !== ultimoErro) console.warn(`[relogio-marketing] Falhou: ${mensagem}`);
    ultimoErro = mensagem;
  } finally {
    rodando = false;
  }
}

export function iniciarRelogioDoMarketing() {
  if (iniciado) return;
  iniciado = true;
  setInterval(() => {
    bater().catch(() => {});
  }, INTERVALO_MS);
  console.log("[relogio-marketing] Ligado (posts agendados, a cada minuto).");
}
