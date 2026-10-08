// Núcleo do agente (processarComandoAgente) nos caminhos que não dependem da
// IA — "sim" do rascunho, "sim"/"não" da ação pendente, proteção contra loop
// — e, com --com-ia, uma pergunta só de leitura pela IA de verdade (custa
// alguns centavos). Apaga tudo o que cria. Rodar:
// npx tsx --conditions=react-server --env-file=.env scripts/teste-nucleo-agente.ts [--com-ia]
import { prisma } from "@/lib/db";
import { processarComandoAgente } from "@/lib/server/agente";
import { registrarDespesaDaMensagem } from "@/lib/server/despesa-agente";

let falhas = 0;
const checar = (c: unknown, m: string) => {
  console.log(`${c ? "ok  " : "FALHOU"} ${m}`);
  if (!c) falhas++;
};
const ZAP = "550000000000097";
const TG = "tg:990000222";
const inicio = new Date();

async function main() {
  const marcos = await prisma.user.findFirstOrThrow({ where: { username: "marcos" } });
  const dani = await prisma.user.findFirstOrThrow({ where: { username: "dani" } });

  // Rascunho + "sim" pelo WhatsApp: confirma sem IA, enquete some, nada de botão.
  await registrarDespesaDaMensagem({
    extracao: { valor: 12.34, fornecedor: "Lanche Teste Nucleo", categoria: "Alimentação", centro: "Administrativo" },
    texto: "lanche 12,34 Lanche Teste Nucleo",
    origem: "TEXTO",
    identificador: ZAP,
    usuarioId: marcos.id,
  });
  const r1 = await processarComandoAgente({ texto: "sim", origem: "WHATSAPP", identificador: ZAP, usuarioId: marcos.id });
  checar(r1.resposta.startsWith("✅ Registrado") && !r1.botoes && !r1.enquete, `WhatsApp: "sim" confirma o rascunho sem IA ("${r1.resposta.slice(0, 50)}...")`);

  // O mesmo no Telegram: vem com o Desfazer.
  await registrarDespesaDaMensagem({
    extracao: { valor: 56.78, fornecedor: "Lanche Teste Nucleo", categoria: "Alimentação", centro: "Administrativo" },
    texto: "lanche 56,78 Lanche Teste Nucleo",
    origem: "TEXTO",
    identificador: TG,
    usuarioId: marcos.id,
  });
  const r2 = await processarComandoAgente({ texto: "pode confirmar", origem: "TELEGRAM", identificador: TG, usuarioId: marcos.id });
  checar(r2.resposta.startsWith("✅ Registrado") && r2.botoes?.flat().some((b) => b.dados.startsWith("d:u:")), "Telegram: confirmação por texto traz o Desfazer");

  // Ação pendente: "não" cancela, "sim" executa (ferramenta só de leitura).
  const pendente = await prisma.comandoAgente.create({
    data: {
      origem: "WHATSAPP",
      identificador: ZAP,
      usuarioId: marcos.id,
      textoComando: "teste",
      status: "AGUARDANDO_CONFIRMACAO",
      ferramentaPendente: "buscar_produtos",
      argumentosPendentes: { termo: "playground" },
      descricaoPendente: "buscar produtos (teste)",
    },
  });
  const r3 = await processarComandoAgente({ texto: "não", origem: "WHATSAPP", identificador: ZAP, usuarioId: marcos.id });
  checar(r3.resposta === "Combinado, não fiz nada." && (await prisma.comandoAgente.findUniqueOrThrow({ where: { id: pendente.id } })).status === "CANCELADO", '"não" cancela a pendente');
  await prisma.comandoAgente.update({ where: { id: pendente.id }, data: { status: "AGUARDANDO_CONFIRMACAO", criadoEm: new Date() } });
  const r4 = await processarComandoAgente({ texto: "sim", origem: "WHATSAPP", identificador: ZAP, usuarioId: marcos.id });
  checar(r4.resposta.startsWith("Feito") && (await prisma.comandoAgente.findUniqueOrThrow({ where: { id: pendente.id } })).status === "CONCLUIDO", '"sim" executa a pendente');

  // Registro do comando já criado pelo canal (comandoId) é completado, não duplicado.
  const recebido = await prisma.comandoAgente.create({ data: { origem: "TELEGRAM", identificador: TG, usuarioId: marcos.id, textoComando: "[recebendo texto]", externalId: `tg:teste-${Date.now()}` } });
  await registrarDespesaDaMensagem({
    extracao: { valor: 9.1, fornecedor: "Lanche Teste Nucleo", categoria: "Alimentação", centro: "Administrativo" },
    texto: "lanche 9,10 Lanche Teste Nucleo",
    origem: "TEXTO",
    identificador: TG,
    usuarioId: marcos.id,
  });
  await processarComandoAgente({ texto: "sim", origem: "TELEGRAM", identificador: TG, usuarioId: marcos.id, comandoId: recebido.id });
  const depois = await prisma.comandoAgente.findUniqueOrThrow({ where: { id: recebido.id } });
  checar(depois.textoComando === "sim" && depois.resposta?.startsWith("✅") && depois.externalId === recebido.externalId, "o registro criado pelo canal recebe o resultado (sem duplicar)");

  if (process.argv.includes("--com-ia")) {
    const r5 = await processarComandoAgente({ texto: "quantos leads entraram hoje?", origem: "TELEGRAM", identificador: TG, usuarioId: marcos.id });
    const ultimo = await prisma.comandoAgente.findFirstOrThrow({ where: { identificador: TG, textoComando: "quantos leads entraram hoje?" }, orderBy: { criadoEm: "desc" } });
    const acoes = (ultimo.acoes ?? []) as { ferramenta: string; ok: boolean }[];
    checar(acoes.some((a) => a.ferramenta === "resumo_leads" && a.ok), `IA de verdade: chamou resumo_leads e a ação ficou registrada ("${r5.resposta.slice(0, 80).replace(/\n/g, " ")}...")`);

    // A Dani (sem Financeiro) não recebe as ferramentas de despesa.
    const r6 = await processarComandoAgente({ texto: "gastei 30 reais de almoço no Restaurante Teste Nucleo", origem: "CRM_TEXTO", identificador: `crm:teste-${dani.id}`, usuarioId: dani.id });
    const daDani = await prisma.despesa.count({ where: { fornecedor: { contains: "Teste Nucleo" }, registradaPorId: dani.id } });
    checar(daDani === 0, `usuário sem Financeiro: a IA não tem como registrar despesa ("${r6.resposta.slice(0, 80).replace(/\n/g, " ")}...")`);
  }
}

main()
  .catch((erro) => {
    console.error(erro);
    falhas++;
  })
  .finally(async () => {
    await prisma.despesa.deleteMany({ where: { fornecedor: { contains: "Teste Nucleo" }, criadoEm: { gte: inicio } } });
    await prisma.comandoAgente.deleteMany({ where: { criadoEm: { gte: inicio }, OR: [{ identificador: { in: [ZAP, TG] } }, { identificador: { startsWith: "crm:teste-" } }] } });
    console.log(`sobras: ${await prisma.despesa.count({ where: { fornecedor: { contains: "Teste Nucleo" } } })}`);
    console.log(falhas ? `${falhas} FALHA(S)` : "tudo ok");
    await prisma.$disconnect();
    process.exit(falhas ? 1 : 0);
  });
