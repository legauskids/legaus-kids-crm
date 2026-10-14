// Número sem WhatsApp e telefone inventado pela IA (incidente de 2026-10-14,
// orçamento #22). No banco, sem IA e sem mandar nada: a mensagem de teste
// nasce "reservada" (tentativaEnvioEm agora) pro relay em produção não
// pegar, e as chamadas ao Telegram são interceptadas. Rodar:
// npx tsx --conditions=react-server --env-file=.env scripts/teste-falha-envio.ts
process.env.TELEGRAM_BOT_TOKEN = "123:token-de-teste";
import { prisma } from "@/lib/db";
import { registrarFalhaEnvio } from "@/lib/server/falha-envio";
import { telefoneConfiavel } from "@/lib/server/agente";

const avisos: string[] = [];
const original = globalThis.fetch;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  if (!String(url).startsWith("https://api.telegram.org")) return original(url, init);
  avisos.push(String(JSON.parse(String(init?.body ?? "{}")).text ?? ""));
  return new Response(JSON.stringify({ ok: true, result: {} }));
}) as typeof fetch;

let falhas = 0;
const checar = (c: unknown, m: string) => {
  console.log(`${c ? "ok  " : "FALHOU"} ${m}`);
  if (!c) falhas++;
};
const TEL = "5520900000417"; // DDD 20 não existe
const TG = "tg:990000555";
const inicio = new Date();

async function main() {
  // 1. Falha de envio: sai da fila e avisa no Telegram
  const contato = await prisma.contato.create({ data: { nome: "Teste Falha Envio", telefone: TEL } });
  const setor = await prisma.setor.findFirstOrThrow();
  const conversa = await prisma.conversa.create({ data: { contatoId: contato.id, setorId: setor.id } });
  const msg = await prisma.mensagem.create({
    data: { conversaId: conversa.id, direcao: "SAIDA", origem: "SISTEMA", texto: "Olá! Segue o orçamento *#0099*", anexoNome: "orcamento-0099.pdf", tentativaEnvioEm: new Date() },
  });
  checar(await registrarFalhaEnvio(msg.id, "SEM_WHATSAPP"), "falha registrada");
  const depois = await prisma.mensagem.findUniqueOrThrow({ where: { id: msg.id } });
  checar(depois.falhaEnvio === "SEM_WHATSAPP" && depois.falhaEnvioEm, "a mensagem fica marcada como não enviada");
  const naFila = await prisma.mensagem.count({ where: { id: msg.id, direcao: "SAIDA", externalId: null, falhaEnvio: null } });
  checar(naFila === 0, "e sai da fila de envio");
  checar(avisos.some((a) => a.includes("orçamento #0099") && a.includes("Teste Falha Envio") && a.includes("(20) 90000-0417")), `aviso no Telegram ("${avisos[0]?.slice(0, 110)}")`);
  checar(!(await registrarFalhaEnvio(msg.id, "SEM_WHATSAPP")), "aviso repetido do relay não avisa de novo");

  // 2. Telefone que a IA passou: só vale se foi dito ou é de contato cadastrado
  checar(!(await telefoneConfiavel("5554969602", { textoMensagem: "Sim", identificador: TG })), 'número montado de memória ("5554969602") é recusado');
  checar(await telefoneConfiavel("5554999991234", { textoMensagem: "manda pro 54 99999-1234 dizendo oi", identificador: TG }), "número digitado na mensagem vale (com máscara, sem 55)");
  checar(await telefoneConfiavel(TEL, { textoMensagem: "manda pra ele", identificador: TG }), "telefone de contato cadastrado vale");
  await prisma.comandoAgente.create({ data: { origem: "TELEGRAM", identificador: TG, textoComando: "o número dele é (51) 98888-7777", resposta: "anotado" } });
  checar(await telefoneConfiavel("5551988887777", { textoMensagem: "pode mandar", identificador: TG }), "número dito na conversa da última meia hora vale");
  checar(!(await telefoneConfiavel("5551988887777", { textoMensagem: "pode mandar", identificador: "tg:990000556" })), "mas não vale pra outra conversa");
}

main()
  .catch((erro) => {
    console.error(erro);
    falhas++;
  })
  .finally(async () => {
    await prisma.mensagem.deleteMany({ where: { conversa: { contato: { telefone: TEL } } } });
    await prisma.conversa.deleteMany({ where: { contato: { telefone: TEL } } });
    await prisma.contato.deleteMany({ where: { telefone: TEL } });
    await prisma.comandoAgente.deleteMany({ where: { identificador: TG, criadoEm: { gte: inicio } } });
    console.log(`sobras: ${await prisma.contato.count({ where: { telefone: TEL } })}`);
    console.log(falhas ? `${falhas} FALHA(S)` : "tudo ok");
    await prisma.$disconnect();
    process.exit(falhas ? 1 : 0);
  });
