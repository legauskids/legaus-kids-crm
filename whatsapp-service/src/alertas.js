// Notificação push via ntfy.sh (https://ntfy.sh) — sem conta, sem custo.
// Usado só pra avisos que precisam de ação humana (sessão desconectada,
// serviço travado tempo demais); falhas transitórias que o próprio serviço
// já resolve sozinho (reconexão normal) não passam por aqui, senão vira
// spam de notificação toda vez que a internet oscila.

const NTFY_TOPICO = process.env.NTFY_TOPICO || "";

export async function avisar(titulo, mensagem, { prioridade = "default", tag = "warning" } = {}) {
  if (!NTFY_TOPICO) return;
  try {
    await fetch(`https://ntfy.sh/${NTFY_TOPICO}`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        Title: titulo,
        Priority: prioridade,
        Tags: tag,
      },
      body: mensagem,
    });
  } catch (erro) {
    console.error("[alertas] Falha ao mandar notificação ntfy:", erro.message);
  }
}
