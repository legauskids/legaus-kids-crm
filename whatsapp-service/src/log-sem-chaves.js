// A libsignal (usada pelo Baileys) imprime o objeto INTEIRO da sessão Signal
// — com chaves privadas, chaves de cadeia e de raiz — sempre que abre,
// fecha ou descarta uma sessão ("Closing session:", "Opening session:",
// "Removing old closed session:", "Session already closed"). Isso ia direto
// pros logs do PM2 em texto puro (visto em 2026-09-25 na troca pro Baileys
// 7). Aqui mantém a linha do evento, que ajuda a diagnosticar, e descarta
// só o objeto com as chaves. Importado logo no começo do index.js.
const EVENTOS_COM_SESSAO = ["Closing session", "Opening session", "Removing old closed session", "Session already closed"];

for (const metodo of ["info", "warn", "log"]) {
  const original = console[metodo].bind(console);
  console[metodo] = (...args) => {
    if (args.length > 1 && typeof args[0] === "string" && EVENTOS_COM_SESSAO.some((e) => args[0].startsWith(e))) {
      return original(`${args[0].replace(/:\s*$/, "")} (dados da sessão omitidos do log: contêm chaves)`);
    }
    return original(...args);
  };
}
