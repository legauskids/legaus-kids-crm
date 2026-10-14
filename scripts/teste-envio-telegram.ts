// "Envia aqui pra eu avaliar" pelo Telegram (incidente de 2026-10-14: o PDF
// do orçamento #22 foi duas vezes pro WhatsApp da CLIENTE). Com a IA de
// verdade (alguns centavos), cliente e produto de teste; nada é mandado de
// verdade — o envio pro cliente só é proposto e cancelado. Rodar:
// npx tsx --conditions=react-server --env-file=.env scripts/teste-envio-telegram.ts
import { prisma } from "@/lib/db";
import { processarComandoAgente, processarBotaoAgente } from "@/lib/server/agente";

let falhas = 0;
const checar = (c: unknown, m: string) => {
  console.log(`${c ? "ok  " : "FALHOU"} ${m}`);
  if (!c) falhas++;
};
const TG = "tg:990000444";
const TEL_CLIENTE = "5554999990417";
const inicio = new Date();
const curta = (t: string) => t.replace(/\s+/g, " ").slice(0, 120);

async function main() {
  const marcos = await prisma.user.findFirstOrThrow({ where: { username: "marcos" } });
  await prisma.contato.create({ data: { nome: "Cliente Teste Envio Telegram", telefone: TEL_CLIENTE, tipo: "CLIENTE" } });
  await prisma.produto.create({ data: { nome: "Produto Teste Envio Telegram", categoria: "Outros Produtos", valorCentavos: 123456 } });
  const enviar = (texto: string) => processarComandoAgente({ texto, origem: "TELEGRAM", identificador: TG, usuarioId: marcos.id });
  const saidasProCliente = () => prisma.mensagem.count({ where: { direcao: "SAIDA", enviadaEm: { gte: inicio }, conversa: { contato: { telefone: TEL_CLIENTE } } } });

  // 1. O pedido do Marcos: gerar e mandar AQUI pra avaliar
  const r1 = await enviar("Gere um orçamento com o Produto Teste Envio Telegram para o Cliente Teste Envio Telegram e envie aqui para eu avaliar.");
  const orcamento = await prisma.orcamento.findFirst({ where: { contato: { telefone: TEL_CLIENTE }, createdAt: { gte: inicio } } });
  checar(orcamento, `orçamento criado ("${curta(r1.resposta)}")`);
  checar(r1.arquivos?.some((a) => a.tipo === "orcamento-pdf" && a.orcamentoId === orcamento?.id), "o PDF vem pra cá, no chat do Telegram");
  checar((await saidasProCliente()) === 0, "NADA foi pro WhatsApp do cliente");

  // 2. Card aqui
  const r2 = await enviar("Gera o card do Produto Teste Envio Telegram e manda aqui.");
  checar(r2.arquivos?.some((a) => a.tipo === "card-produto"), `card vem pra cá ("${curta(r2.resposta)}")`);
  checar((await saidasProCliente()) === 0, "e continua nada pro cliente");

  // 3. Mandar pro cliente: confirma mostrando o número (e aqui é cancelado)
  const r3 = await enviar("Agora manda esse orçamento pro WhatsApp do Cliente Teste Envio Telegram.");
  const pendente = await prisma.comandoAgente.findFirst({ where: { identificador: TG, status: "AGUARDANDO_CONFIRMACAO" }, orderBy: { criadoEm: "desc" } });
  checar(pendente?.ferramentaPendente === "enviar_orcamento_whatsapp" && pendente.descricaoPendente?.includes("(54) 99999-0417"), `envio pro cliente pede confirmação com o número ("${pendente?.descricaoPendente}")`);
  checar(r3.botoes?.flat().some((b) => b.dados === `cx:${pendente?.id}`), "com os botões Confirmar/Cancelar");
  if (pendente) await processarBotaoAgente({ identificador: TG, usuarioId: marcos.id, dados: `cx:${pendente.id}` });
  checar((await saidasProCliente()) === 0, "cancelado: nada foi pro cliente");
}

main()
  .catch((erro) => {
    console.error(erro);
    falhas++;
  })
  .finally(async () => {
    await prisma.orcamento.deleteMany({ where: { contato: { telefone: TEL_CLIENTE }, createdAt: { gte: inicio } } });
    await prisma.mensagem.deleteMany({ where: { conversa: { contato: { telefone: TEL_CLIENTE } } } });
    await prisma.conversa.deleteMany({ where: { contato: { telefone: TEL_CLIENTE } } });
    await prisma.contato.deleteMany({ where: { telefone: TEL_CLIENTE } });
    await prisma.produto.deleteMany({ where: { nome: "Produto Teste Envio Telegram" } });
    await prisma.comandoAgente.deleteMany({ where: { identificador: TG, criadoEm: { gte: inicio } } });
    const sobras = (await prisma.contato.count({ where: { telefone: TEL_CLIENTE } })) + (await prisma.produto.count({ where: { nome: "Produto Teste Envio Telegram" } }));
    console.log(`sobras: ${sobras}`);
    console.log(falhas ? `${falhas} FALHA(S)` : "tudo ok");
    await prisma.$disconnect();
    process.exit(falhas ? 1 : 0);
  });
