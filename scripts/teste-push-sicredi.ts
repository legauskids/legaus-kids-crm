// Push do Sicredi (MacroDroid -> CRM -> Telegram), 2026-10-07, no banco e
// sem mandar nada de verdade (chamadas ao Telegram interceptadas). Apaga
// tudo o que cria. Rodar:
// npx tsx --conditions=react-server --env-file=.env scripts/teste-push-sicredi.ts
import { prisma } from "@/lib/db";
import { processarPushBancario, negociosDosAvisos, tokenPush, tokenPushConfere, destinatarioDosAvisos } from "@/lib/server/push-bancario";
import { processarBotaoAgente } from "@/lib/server/agente";
import { registrarDespesaDaMensagem } from "@/lib/server/despesa-agente";
import { criarDespesa } from "@/lib/server/despesas";
import { diaBrasilia } from "@/lib/utils/brasilia";

globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, result: {} }))) as typeof fetch;

let falhas = 0;
const checar = (c: unknown, m: string) => {
  console.log(`${c ? "ok  " : "FALHOU"} ${m}`);
  if (!c) falhas++;
};
const inicio = new Date();
const avisos: string[] = [];
const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }).replace(",", " -");
const pix = (verbo: "pagou" | "recebeu", valor: string, quem: string, seg: number) =>
  `Você ${verbo} um Pix no valor de R$ ${valor}\n${quem} CPF ###.111.222-##\nBanco Teste S.A.\n${agora.slice(0, 10)} - 10:0${seg}:0${seg}\nAproveite todas vantagens do Pix no Sicredi.`;
const dados = (b: { dados: string }[][] | undefined) => (b ?? []).flat().map((x) => x.dados);

async function main() {
  const destino = await destinatarioDosAvisos();
  checar(destino?.telegramId, `as perguntas vão pro Telegram de ${destino?.nome}`);
  const tg = `tg:${destino!.telegramId}`;
  const marcos = await prisma.user.findFirstOrThrow({ where: { id: destino!.id } });

  // Chave da rota
  checar(tokenPushConfere(`Bearer ${tokenPush()}`) && !tokenPushConfere("Bearer errada") && !tokenPushConfere(null), "rota só aceita a chave do push");

  // 1. Saída: rascunho de despesa com os botões
  const r1 = await processarPushBancario({ titulo: "Sicredi Pix", texto: pix("pagou", "7,77", "Fornecedor Teste Push", 1) });
  if (r1.status !== "registrado") throw new Error(`push 1: ${r1.status}`);
  avisos.push(r1.avisoId);
  const aviso1 = await prisma.avisoBancario.findUniqueOrThrow({ where: { id: r1.avisoId }, include: { despesa: true } });
  checar(aviso1.despesa?.origem === "PUSH" && aviso1.despesa.status === "A_CONFIRMAR" && aviso1.despesa.telefoneOrigem === tg, "Pix enviado vira despesa esperando confirmação, na conversa do Telegram");
  checar(r1.resposta.mensagem.includes("Pix de") && dados(r1.resposta.botoes).includes(`d:ok:${aviso1.despesaId}`), "pergunta no Telegram com Confirmar/Corrigir/Descartar");

  // 2. O mesmo push de novo
  const r2 = await processarPushBancario({ titulo: "Sicredi Pix", texto: pix("pagou", "7,77", "Fornecedor Teste Push", 1) });
  checar(r2.status === "duplicado", "o mesmo push mandado de novo não duplica");

  // 3a. Áudio do mesmo gasto com nome parecido: completa o rascunho do push sozinho
  const parecido = await registrarDespesaDaMensagem({
    extracao: { valor: 7.77, fornecedor: "Fornecedor Teste Push", categoria: "Alimentação" },
    texto: "gastei 7,77 no Fornecedor Teste Push",
    origem: "AUDIO",
    identificador: tg,
    usuarioId: marcos.id,
    anexo: { bytes: Buffer.from("OggS teste"), mime: "audio/ogg", nome: "audio.ogg" },
  });
  const pushComAudio = await prisma.despesa.findUniqueOrThrow({ where: { id: aviso1.despesaId! } });
  checar(parecido.despesaId === aviso1.despesaId && pushComAudio.anexoMime === "audio/ogg", "áudio com o mesmo nome do Pix completa o rascunho do push, sem criar outra");

  // 3b. Áudio do mesmo valor com outro nome (Pix traz a razão social): pergunta e junta
  const r3push = await processarPushBancario({ titulo: "Sicredi Pix", texto: pix("pagou", "7,78", "Comercio Teste Push Ltda", 5) });
  if (r3push.status !== "registrado") throw new Error(`push 3b: ${r3push.status}`);
  avisos.push(r3push.avisoId);
  const aviso3 = await prisma.avisoBancario.findUniqueOrThrow({ where: { id: r3push.avisoId } });
  const audio = await registrarDespesaDaMensagem({
    extracao: { valor: 7.78, fornecedor: "Sorveteria Zeta", categoria: "Alimentação" },
    texto: "gastei 7,78 na sorveteria",
    origem: "AUDIO",
    identificador: tg,
    usuarioId: marcos.id,
    anexo: { bytes: Buffer.from("OggS teste"), mime: "audio/ogg", nome: "audio.ogg" },
  });
  checar(dados(audio.botoes).includes(`dj:${audio.despesaId}:${aviso3.despesaId}`), "áudio do mesmo valor com outro nome: pergunta se é o mesmo gasto");
  const r3 = await processarBotaoAgente({ identificador: tg, usuarioId: marcos.id, dados: `dj:${audio.despesaId}:${aviso3.despesaId}` });
  const depoisJuntar = await prisma.despesa.findUniqueOrThrow({ where: { id: aviso3.despesaId! } });
  checar(
    !(await prisma.despesa.findUnique({ where: { id: audio.despesaId } })) && depoisJuntar.anexoMime === "audio/ogg" && dados(r3?.botoes).includes(`d:ok:${aviso3.despesaId}`),
    "juntou: uma despesa só, com o áudio, e o resumo volta com os botões",
  );

  // 4. Push depois de uma despesa já lançada
  const lancada = await criarDespesa({
    dia: diaBrasilia(new Date()),
    valorCentavos: 888,
    fornecedor: "Posto Teste Push",
    descricao: null,
    categoriaId: null,
    centroGeralId: "cg-veiculos",
    negocioId: null,
    origem: "MANUAL",
    registradaPorId: marcos.id,
    rascunho: true,
  });
  await prisma.despesa.update({ where: { id: lancada.id }, data: { status: "AGUARDANDO_CONCILIACAO" } });
  const r4 = await processarPushBancario({ titulo: "Sicredi Pix", texto: pix("pagou", "8,88", "Posto de Combustiveis Teste Push Ltda", 2) });
  if (r4.status !== "registrado") throw new Error(`push 4: ${r4.status}`);
  avisos.push(r4.avisoId);
  const aviso4 = await prisma.avisoBancario.findUniqueOrThrow({ where: { id: r4.avisoId } });
  checar(dados(r4.resposta.botoes).includes(`dj:${aviso4.despesaId}:${lancada.id}`), "push de algo já lançado: pergunta se é o mesmo");
  await processarBotaoAgente({ identificador: tg, usuarioId: marcos.id, dados: `dj:${aviso4.despesaId}:${lancada.id}` });
  const aviso4Depois = await prisma.avisoBancario.findUniqueOrThrow({ where: { id: r4.avisoId } });
  checar(aviso4Depois.despesaId === lancada.id && (await prisma.despesa.count({ where: { valorCentavos: 888, fornecedor: { contains: "Teste Push" } } })) === 1, "juntou: o aviso passa pra despesa que já existia, sem duplicar");

  // 5. Entrada: de qual negócio é
  const r5 = await processarPushBancario({ titulo: "Sicredi Pix", texto: pix("recebeu", "9.876,54", "Cliente Teste Push", 3) });
  if (r5.status !== "registrado") throw new Error(`push 5: ${r5.status}`);
  avisos.push(r5.avisoId);
  const botaoNegocio = dados(r5.resposta.botoes).find((d) => d.startsWith(`an:${r5.avisoId}:`));
  checar(botaoNegocio && dados(r5.resposta.botoes).includes(`ax:${r5.avisoId}`) && r5.resposta.mensagem.includes("Pix recebido"), "Pix recebido pergunta de qual negócio é, com botões");
  const negocioId = botaoNegocio!.split(":")[2];
  const r6 = await processarBotaoAgente({ identificador: tg, usuarioId: marcos.id, dados: botaoNegocio! });
  const aviso5 = await prisma.avisoBancario.findUniqueOrThrow({ where: { id: r5.avisoId } });
  checar(aviso5.status === "RESPONDIDO" && aviso5.negocioId === negocioId && r6?.resposta.includes("Anotado"), "escolher o negócio fica anotado no aviso");
  const sugestao = await negociosDosAvisos([{ id: "linha-teste", dia: diaBrasilia(new Date()), valorCentavos: 987654, tipo: "ENTRADA" }]);
  checar(sugestao.get("linha-teste") === negocioId, "na conciliação, a entrada do extrato vem com esse negócio pré-selecionado");
  checar((await processarBotaoAgente({ identificador: "tg:123", usuarioId: marcos.id, dados: botaoNegocio! })) === null, "botão do aviso em outra conversa é ignorado");

  // 6. Entrada que não é de negócio
  const r7 = await processarPushBancario({ titulo: "Sicredi Pix", texto: pix("recebeu", "1,23", "Outro Teste Push", 4) });
  if (r7.status !== "registrado") throw new Error(`push 7: ${r7.status}`);
  avisos.push(r7.avisoId);
  await processarBotaoAgente({ identificador: tg, usuarioId: marcos.id, dados: `ax:${r7.avisoId}` });
  checar((await prisma.avisoBancario.findUniqueOrThrow({ where: { id: r7.avisoId } })).status === "IGNORADO", "'não é de negócio' marca o aviso como ignorado");

  // 7. Notificação que não é movimentação
  checar((await processarPushBancario({ titulo: "Sicredi", texto: "Aproveite todas vantagens do Pix no Sicredi." })).status === "ignorado", "propaganda do app é ignorada");
}

main()
  .catch((erro) => {
    console.error(erro);
    falhas++;
  })
  .finally(async () => {
    await prisma.avisoBancario.deleteMany({ where: { id: { in: avisos } } });
    await prisma.despesa.deleteMany({ where: { OR: [{ fornecedor: { contains: "Teste Push" } }, { fornecedor: "Sorveteria Zeta" }], criadoEm: { gte: inicio } } });
    const sobras = (await prisma.despesa.count({ where: { fornecedor: { contains: "Teste Push" } } })) + (await prisma.avisoBancario.count({ where: { texto: { contains: "Teste Push" } } }));
    console.log(`sobras: ${sobras}`);
    console.log(falhas ? `${falhas} FALHA(S)` : "tudo ok");
    await prisma.$disconnect();
    process.exit(falhas ? 1 : 0);
  });
