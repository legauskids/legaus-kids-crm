// Etapa 3 do Telegram (2026-10-07) no banco, sem IA e sem mandar nada de
// verdade: as chamadas pra api.telegram.org são interceptadas. Apaga tudo o
// que cria. Rodar:
// npx tsx --conditions=react-server --env-file=.env scripts/teste-telegram-etapa3.ts
import { prisma } from "@/lib/db";
import { registrarDespesaDaMensagem } from "@/lib/server/despesa-agente";
import { processarBotaoAgente } from "@/lib/server/agente";
import { processarUpdateTelegram } from "@/lib/server/telegram";
import { criarDespesa } from "@/lib/server/despesas";

process.env.TELEGRAM_BOT_TOKEN = "123:token-de-teste";
process.env.TELEGRAM_ALLOWED_IDS = "7366553763";

type Chamada = { metodo: string; corpo: Record<string, unknown> };
const chamadas: Chamada[] = [];
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url);
  if (u.startsWith("https://api.telegram.org")) {
    chamadas.push({ metodo: u.split("/").pop() ?? "", corpo: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { headers: { "content-type": "application/json" } });
  }
  return fetchOriginal(url, init);
}) as typeof fetch;


let falhas = 0;
const checar = (c: unknown, m: string) => {
  console.log(`${c ? "ok  " : "FALHOU"} ${m}`);
  if (!c) falhas++;
};
const TG = "tg:990000111";
const TG_MARCOS = "tg:7366553763";
const inicio = new Date();
const comandosCriados: string[] = [];
const base = 980000000 + Math.floor(Math.random() * 100000);
const dados = (botoes: { dados: string }[][] | undefined) => (botoes ?? []).flat().map((b) => b.dados);

async function main() {
  const marcos = await prisma.user.findFirstOrThrow({ where: { username: "marcos" } });
  const categorias = await prisma.centroCusto.findMany({ where: { tipo: "DESPESA", ativo: true } });
  const alimentacao = categorias.find((c) => c.nome === "Alimentação")!;

  // 1. Despesa contada no Telegram: rascunho com botões, sem enquete
  const r1 = await registrarDespesaDaMensagem({
    extracao: { valor: 123.45, fornecedor: "Posto Teste Telegram", categoria: "Veículos e combustível" },
    texto: "gastei 123,45 no Posto Teste Telegram",
    origem: "TEXTO",
    identificador: TG,
    usuarioId: marcos.id,
  });
  const id = r1.despesaId;
  checar(!r1.enquete && dados(r1.botoes).includes(`d:ok:${id}`) && dados(r1.botoes).includes(`d:x:${id}`), "rascunho no Telegram: botões Confirmar/Corrigir/Descartar, sem enquete");
  checar(dados(r1.botoes).includes(`d:vc:${id}`) && dados(r1.botoes).includes(`d:ng:${id}`), "categoria deduzida: botão de trocar + 'é de um negócio'");
  checar(r1.mensagem.includes("Toque num botão"), "texto do resumo fala dos botões");

  // 2. Ver todas as categorias e escolher Alimentação
  const r2 = await processarBotaoAgente({ identificador: TG, usuarioId: marcos.id, dados: `d:vc:${id}` });
  const botaoAlimentacao = dados(r2?.botoes).find((d) => d === `dc:${id}:${alimentacao.id.slice(0, 8)}`);
  checar(botaoAlimentacao && dados(r2?.botoes).every((d) => Buffer.byteLength(d) <= 64), "lista de categorias com todas cabendo em 64 bytes");
  const r3 = await processarBotaoAgente({ identificador: TG, usuarioId: marcos.id, dados: botaoAlimentacao! });
  const depoisCategoria = await prisma.despesa.findUniqueOrThrow({ where: { id }, include: { centroGeral: true } });
  checar(depoisCategoria.categoriaId === alimentacao.id && r3?.resposta.includes("Categoria trocada"), `categoria trocada pelo botão (centro acompanhou: ${depoisCategoria.centroGeral?.nome ?? "-"})`);

  // 3. Outra conversa não mexe nessa despesa
  checar((await processarBotaoAgente({ identificador: "tg:123", usuarioId: marcos.id, dados: `d:ok:${id}` })) === null, "botão de outra conversa é ignorado");

  // 4. Confirmar -> registrada com Desfazer; Desfazer -> volta a rascunho; Descartar -> some
  const r4 = await processarBotaoAgente({ identificador: TG, usuarioId: marcos.id, dados: `d:ok:${id}` });
  checar((await prisma.despesa.findUniqueOrThrow({ where: { id } })).status === "AGUARDANDO_CONCILIACAO" && dados(r4?.botoes).includes(`d:u:${id}`), "Confirmar registra e oferece Desfazer");
  const r5 = await processarBotaoAgente({ identificador: TG, usuarioId: marcos.id, dados: `d:u:${id}` });
  checar((await prisma.despesa.findUniqueOrThrow({ where: { id } })).status === "A_CONFIRMAR" && dados(r5?.botoes).includes(`d:ok:${id}`), "Desfazer volta pra rascunho com os botões");
  await processarBotaoAgente({ identificador: TG, usuarioId: marcos.id, dados: `d:x:${id}` });
  checar(!(await prisma.despesa.findUnique({ where: { id } })), "Descartar apaga o rascunho");

  // 5. Parecida com uma já registrada: pergunta e junta
  const existente = await criarDespesa({
    dia: "2026-10-06",
    valorCentavos: 4321,
    fornecedor: "Restaurante Teste Telegram",
    descricao: null,
    categoriaId: alimentacao.id,
    centroGeralId: "cg-administrativo",
    negocioId: null,
    origem: "AUDIO",
    registradaPorId: marcos.id,
    telefoneOrigem: TG,
  });
  const r6 = await registrarDespesaDaMensagem({
    extracao: { valor: 43.21, fornecedor: "Restaurante Teste Telegram", dataTexto: "06/10/2026" },
    texto: "comprovante",
    origem: "COMPROVANTE",
    identificador: TG,
    usuarioId: marcos.id,
    anexo: { bytes: Buffer.from("%PDF teste"), mime: "application/pdf", nome: "comprovante-teste.pdf" },
  });
  checar(dados(r6.botoes).includes(`dj:${r6.despesaId}:${existente.id}`), "comprovante igual a uma registrada: pergunta 'é a mesma, juntar' / 'é outra'");
  const r7 = await processarBotaoAgente({ identificador: TG, usuarioId: marcos.id, dados: `dj:${r6.despesaId}:${existente.id}` });
  const juntada = await prisma.despesa.findUniqueOrThrow({ where: { id: existente.id } });
  checar(
    !(await prisma.despesa.findUnique({ where: { id: r6.despesaId } })) && juntada.anexoMime === "application/pdf" && r7?.resposta.includes("Juntei"),
    "juntar: fica uma despesa só, com o comprovante",
  );

  // 6. Ação sensível pendente com botões
  const pendente = await prisma.comandoAgente.create({
    data: {
      origem: "TELEGRAM",
      identificador: TG,
      usuarioId: marcos.id,
      textoComando: "teste",
      status: "AGUARDANDO_CONFIRMACAO",
      ferramentaPendente: "buscar_produtos",
      argumentosPendentes: { termo: "playground" },
      descricaoPendente: "buscar produtos (teste)",
    },
  });
  comandosCriados.push(pendente.id);
  const r8 = await processarBotaoAgente({ identificador: TG, usuarioId: marcos.id, dados: `ca:${pendente.id}` });
  const depoisPendente = await prisma.comandoAgente.findUniqueOrThrow({ where: { id: pendente.id } });
  checar(r8?.resposta.startsWith("Feito") && depoisPendente.status === "CONCLUIDO" && Array.isArray(depoisPendente.acoes), "Confirmar no botão executa a pendente e registra a ação");
  const r9 = await processarBotaoAgente({ identificador: TG, usuarioId: marcos.id, dados: `ca:${pendente.id}` });
  checar(r9?.resposta.includes("já foi feito"), "tocar de novo não executa duas vezes");

  // 7. Adaptador: toque real chegando pelo webhook (conversa do Marcos)
  const doMarcos = await registrarDespesaDaMensagem({
    extracao: { valor: 9.99, fornecedor: "Padaria Teste Telegram", categoria: "Alimentação", centro: "Administrativo" },
    texto: "gastei 9,99 na Padaria Teste Telegram",
    origem: "TEXTO",
    identificador: TG_MARCOS,
    usuarioId: marcos.id,
  });
  chamadas.length = 0;
  await processarUpdateTelegram({
    update_id: base + 1,
    callback_query: {
      id: "cb-teste",
      from: { id: 7366553763, first_name: "Marcos" },
      data: `d:co:${doMarcos.despesaId}`,
      message: { message_id: 555, chat: { id: 7366553763, type: "private" }, reply_markup: { inline_keyboard: [[{ text: "✏️ Corrigir", callback_data: `d:co:${doMarcos.despesaId}` }]] } },
    },
  });
  const metodos = chamadas.map((c) => c.metodo);
  checar(metodos.includes("answerCallbackQuery") && metodos.includes("editMessageReplyMarkup") && metodos.includes("sendMessage"), `webhook do botão: responde o toque, tira o teclado e manda a resposta (${metodos.join(", ")})`);
  const registro = await prisma.comandoAgente.findUnique({ where: { externalId: `tg:${base + 1}` } });
  if (registro) comandosCriados.push(registro.id);
  checar(registro?.textoComando === "[botão: ✏️ Corrigir]" && registro.resposta?.includes("O que está errado"), "registro da conversa com o texto do botão e a resposta");

  chamadas.length = 0;
  await processarUpdateTelegram({ update_id: base + 2, message: { message_id: 1, from: { id: 7366553763, first_name: "Marcos" }, chat: { id: 7366553763, type: "private" }, text: "/ajuda" } });
  const envio = chamadas.find((c) => c.metodo === "sendMessage");
  checar(envio?.corpo.parse_mode === "HTML" && String(envio.corpo.text).includes("<b>Despesas</b>"), "/ajuda responde sem IA, em HTML");
  const ajuda = await prisma.comandoAgente.findUnique({ where: { externalId: `tg:${base + 2}` } });
  if (ajuda) comandosCriados.push(ajuda.id);

  chamadas.length = 0;
  await processarUpdateTelegram({ update_id: base + 3, message: { message_id: 1, from: { id: 111, first_name: "X" }, chat: { id: 111, type: "private" }, text: "oi" } });
  checar(chamadas.length === 0, "ID não autorizado: nenhuma chamada ao Telegram");
  const ignorado = await prisma.comandoAgente.findUnique({ where: { externalId: `tg:${base + 3}` } });
  if (ignorado) comandosCriados.push(ignorado.id);
  await prisma.despesa.deleteMany({ where: { id: doMarcos.despesaId } });
}

main()
  .catch((erro) => {
    console.error(erro);
    falhas++;
  })
  .finally(async () => {
    await prisma.despesa.deleteMany({ where: { telefoneOrigem: { in: [TG, TG_MARCOS] }, criadoEm: { gte: inicio }, fornecedor: { contains: "Teste Telegram" } } });
    await prisma.comandoAgente.deleteMany({ where: { id: { in: comandosCriados } } });
    const sobras = await prisma.despesa.count({ where: { fornecedor: { contains: "Teste Telegram" } } });
    console.log(`sobras: ${sobras}`);
    console.log(falhas ? `${falhas} FALHA(S)` : "tudo ok");
    await prisma.$disconnect();
    process.exit(falhas ? 1 : 0);
  });
