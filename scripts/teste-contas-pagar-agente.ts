// Contas a pagar pelo agente (2026-11-23, etapa 2), no banco, sem IA e sem
// mandar nada: rascunho, botões, enquete, "sim", parcelas, conta fixa,
// "paguei", push do banco e rascunho esquecido na aba. Apaga tudo o que cria.
// Rodar:
// node --dns-result-order=ipv4first node_modules/tsx/dist/cli.mjs --conditions=react-server --env-file=.env scripts/teste-contas-pagar-agente.ts
import { prisma } from "@/lib/db";
import { processarComandoAgente, processarBotaoAgente } from "@/lib/server/agente";
import { registrarContaDaMensagem, responderEnqueteConta, corrigirContaDaConversa, confirmarRascunhoConta } from "@/lib/server/conta-agente";
import { registrarDespesaDaMensagem, confirmarRascunho } from "@/lib/server/despesa-agente";
import { criarContaPagar, listarRascunhosConta, atualizarContaPagar, gerarContasFixas } from "@/lib/server/contas-pagar";
import { processarPushBancario, destinatarioDosAvisos } from "@/lib/server/push-bancario";
import { diaBrasilia, somarDias } from "@/lib/utils/brasilia";

// Nada sai pela rede (Telegram/WhatsApp): as funções só devolvem a resposta.
globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, result: {} }))) as typeof fetch;

const MARCA = `TESTE-CA-${Date.now()}`;
const tg = `tg:${MARCA}`;
const wa = `5500${String(Date.now()).slice(-9)}`;
let falhas = 0;
const ok = (c: unknown, m: string) => {
  console.log(`${c ? "ok  " : "FALHOU"} ${m}`);
  if (!c) falhas++;
};
const dados = (b: { dados: string }[][] | undefined) => (b ?? []).flat().map((x) => x.dados);
const avisos: string[] = [];

async function main() {
  const marcos = await prisma.user.findFirstOrThrow({ where: { isAdmin: true, telegramId: { not: null } }, select: { id: true } });
  const categoria = await prisma.centroCusto.findFirstOrThrow({ where: { tipo: "DESPESA", ativo: true }, orderBy: { ordem: "asc" }, select: { id: true, nome: true, centroGeralPadraoId: true } });
  const outraCategoria = await prisma.centroCusto.findFirstOrThrow({ where: { tipo: "DESPESA", ativo: true, id: { not: categoria.id } }, select: { id: true, nome: true } });
  const centros = await prisma.centroGeral.findMany({ where: { ativo: true }, select: { id: true, nome: true }, take: 2 });
  const hoje = diaBrasilia(new Date());
  const antes = { contas: await prisma.contaPagar.count(), despesas: await prisma.despesa.count() };
  console.log("antes:", antes);
  const pdf = { bytes: Buffer.from("%PDF-1.4 boleto"), mime: "application/pdf", nome: "boleto.pdf" };

  try {
    // 1. Telegram: boleto em PDF vira rascunho com botões
    const r1 = await registrarContaDaMensagem({
      extracao: { valor: 487.9, fornecedor: `${MARCA} RGE`, vencimentoTexto: "10/12/2026", categoria: categoria.nome, codigoPagamento: "8366 0000 4887" },
      texto: "",
      origem: "ARQUIVO",
      identificador: tg,
      usuarioId: marcos.id,
      anexo: pdf,
    });
    let c1 = await prisma.contaPagar.findUniqueOrThrow({ where: { id: r1.contaId! } });
    ok(c1.status === "A_CONFIRMAR" && c1.telefoneOrigem === tg && c1.anexoMime === "application/pdf" && c1.codigoPagamento === "8366 0000 4887", "boleto vira rascunho com arquivo e código");
    ok(r1.mensagem.includes("📄 *R$ 487,90*") && r1.mensagem.includes("Vence 10/12/2026") && dados(r1.botoes).includes(`cp:ok:${r1.contaId}`), "resumo + botões no Telegram");
    ok(!r1.enquete, "Telegram não leva enquete");

    // 2. Botões: categoria e centro
    const vc = await processarBotaoAgente({ identificador: tg, usuarioId: marcos.id, dados: `cp:vc:${c1.id}` });
    ok(dados(vc?.botoes).some((d) => d.startsWith(`cpc:${c1.id}:`)), "ver categorias");
    await processarBotaoAgente({ identificador: tg, usuarioId: marcos.id, dados: `cpc:${c1.id}:${outraCategoria.id.slice(0, 8)}` });
    await processarBotaoAgente({ identificador: tg, usuarioId: marcos.id, dados: `cpg:${c1.id}:${centros[1].id}` });
    c1 = await prisma.contaPagar.findUniqueOrThrow({ where: { id: c1.id } });
    ok(c1.categoriaId === outraCategoria.id && c1.centroGeralId === centros[1].id, "categoria e centro trocados pelos botões");
    ok((await processarBotaoAgente({ identificador: "tg:outra-pessoa", usuarioId: marcos.id, dados: `cp:ok:${c1.id}` })) === null, "botão de outra conversa é ignorado");

    // 3. Correção: vencimento e parcelas
    const corr = await corrigirContaDaConversa({ identificador: tg, correcao: { vencimentoTexto: "dia 15", parcelas: 3 }, texto: "vence dia 15, são 3 parcelas" });
    c1 = await prisma.contaPagar.findUniqueOrThrow({ where: { id: c1.id } });
    ok(diaBrasilia(c1.vencimento) === "2026-12-15" && c1.totalParcelas === 3 && corr.mensagem.includes("3 parcelas"), `corrigido: ${diaBrasilia(c1.vencimento)}, ${c1.totalParcelas} parcelas`);
    const igual = await corrigirContaDaConversa({ identificador: tg, correcao: { parcelas: 3 }, texto: "3 parcelas" });
    ok(igual.mensagem.startsWith("Já está assim"), "correção sem mudança responde curto");

    // 4. "sim" (atalho, sem IA): lança as 3 parcelas
    const sim = await processarComandoAgente({ texto: "sim", origem: "TELEGRAM", identificador: tg, usuarioId: marcos.id });
    const serie = await prisma.contaPagar.findMany({ where: { fornecedor: `${MARCA} RGE` }, orderBy: { vencimento: "asc" } });
    ok(sim.resposta.startsWith("✅ Conta lançada"), "sim lança a conta");
    ok(serie.length === 3 && serie.every((c) => c.status === "ABERTA" && c.serieId === serie[0].serieId && c.totalParcelas === 3), "3 parcelas abertas na mesma série");
    ok(serie.map((c) => diaBrasilia(c.vencimento)).join() === "2026-12-15,2027-01-15,2027-02-15", "vencimentos das parcelas");
    ok(serie[0].anexoMime && serie[0].codigoPagamento && !serie[1].anexoMime && !serie[1].codigoPagamento, "arquivo e código só na 1ª");
    ok(serie[1].categoriaId === outraCategoria.id && serie[2].centroGeralId === centros[1].id, "parcelas com a categoria e o centro escolhidos");

    // 5. WhatsApp: sem vencimento, enquete, complemento
    const r2 = await registrarContaDaMensagem({ extracao: { valor: 120, fornecedor: `${MARCA} Internet`, categoria: categoria.nome }, texto: "conta da internet 120", origem: "TEXTO", identificador: wa, usuarioId: marcos.id });
    ok(r2.enquete?.ref === `conta:${r2.contaId}` && r2.mensagem.includes("Vencimento: ?") && !r2.botoes, "WhatsApp: enquete, e pede o vencimento");
    const falta = await responderEnqueteConta({ identificador: wa, ref: `conta:${r2.contaId}`, opcao: "✅ Confirmar" });
    ok(falta?.mensagem.includes("Ainda falta: vencimento"), "confirmar sem vencimento não lança");
    const comp = await registrarContaDaMensagem({ extracao: { vencimentoTexto: "dia 5", repeteTodoMes: true }, texto: "vence dia 5, é todo mês", origem: "TEXTO", identificador: wa, usuarioId: marcos.id });
    const c2 = await prisma.contaPagar.findUniqueOrThrow({ where: { id: r2.contaId! } });
    ok(comp.contaId === r2.contaId && diaBrasilia(c2.vencimento) === "2026-12-05" && c2.repeteTodoMes, "complemento: vencimento e conta fixa no mesmo rascunho");
    ok((await prisma.contaPagar.count({ where: { telefoneOrigem: wa } })) === 1, "complemento não cria outra conta");
    ok((await responderEnqueteConta({ identificador: "5511999999999", ref: `conta:${r2.contaId}`, opcao: "✅ Confirmar" })) === null, "voto de outra conversa é ignorado");
    const lancada = await responderEnqueteConta({ identificador: wa, ref: `conta:${r2.contaId}`, opcao: "✅ Confirmar" });
    const fixa = await prisma.contaPagar.findUniqueOrThrow({ where: { id: r2.contaId! } });
    ok(lancada?.mensagem.includes("Repete todo mês") && fixa.status === "ABERTA" && fixa.serieId && fixa.diaVencimento === 5, "enquete Confirmar lança a conta fixa");

    // 5b. Nada para lançar (o modelo forçado sem dados): não cria conta vazia
    const vazio = await registrarContaDaMensagem({ extracao: { fornecedor: "<UNKNOWN>" }, texto: "o que vence essa semana?", origem: "TEXTO", identificador: `${tg}-vazio`, usuarioId: marcos.id });
    ok(vazio.contaId === null && vazio.mensagem.startsWith("Não entendi a conta"), "sem valor, vencimento nem arquivo: não cria rascunho");

    // 6. "descarta" (atalho) apaga o rascunho
    const r3 = await registrarContaDaMensagem({ extracao: { valor: 50, fornecedor: `${MARCA} Descartar`, vencimentoTexto: "sexta" }, texto: "", origem: "TEXTO", identificador: wa, usuarioId: marcos.id });
    const desc = await processarComandoAgente({ texto: "descarta essa conta", origem: "WHATSAPP", identificador: wa, usuarioId: marcos.id });
    ok(desc.resposta.startsWith("Descartei") && !(await prisma.contaPagar.findUnique({ where: { id: r3.contaId! } })), "descarta apaga o rascunho");

    // 7. "Paguei" registrado direto, com valor de conta aberta → pergunta (enquete no WhatsApp)
    await criarContaPagar({ fornecedor: `${MARCA} Madeireira`, vencimento: somarDias(hoje, 2), valorCentavos: 25000, categoriaId: categoria.id, centroGeralId: centros[0].id, negocioId: null, repeticao: "UNICA", registradaPorId: marcos.id });
    const contaMad = await prisma.contaPagar.findFirstOrThrow({ where: { fornecedor: `${MARCA} Madeireira` } });
    const paguei = await registrarDespesaDaMensagem({
      extracao: { valor: 250, fornecedor: `${MARCA} Madeireira`, categoria: categoria.nome, centro: centros[0].nome },
      texto: `paguei 250 na ${MARCA} Madeireira, categoria ${categoria.nome}, centro de custo ${centros[0].nome}`,
      origem: "TEXTO",
      identificador: wa,
      usuarioId: marcos.id,
    });
    ok(paguei.registradaDireto, "despesa ditada completa entra direto");
    ok(paguei.mensagem.includes("É o pagamento dela?") && paguei.enquete?.ref === `pagamento:${contaMad.id}:${paguei.despesaId}`, "pergunta 'É o pagamento dela?' com enquete");
    const nao = await responderEnqueteConta({ identificador: wa, ref: `pagamento:${contaMad.id}:${paguei.despesaId}`, opcao: "➖ Não" });
    ok(nao?.mensagem === "Ok, não liguei a nenhuma conta." && (await prisma.contaPagar.findUniqueOrThrow({ where: { id: contaMad.id } })).status === "ABERTA", "'Não' não liga");
    const sim2 = await responderEnqueteConta({ identificador: wa, ref: `pagamento:${contaMad.id}:${paguei.despesaId}`, opcao: "✅ Sim, é essa conta" });
    const mad = await prisma.contaPagar.findUniqueOrThrow({ where: { id: contaMad.id } });
    ok(sim2?.mensagem.includes("marcada como paga") && mad.status === "PAGA" && mad.despesaId === paguei.despesaId && !mad.despesaCriada, "'Sim' liga a despesa e marca a conta como paga");

    // 8. Comprovante (rascunho) → confirmar → pergunta com botões no Telegram
    await criarContaPagar({ fornecedor: `${MARCA} Unimed`, vencimento: hoje, valorCentavos: 33300, categoriaId: categoria.id, centroGeralId: centros[0].id, negocioId: null, repeticao: "UNICA", registradaPorId: marcos.id });
    const contaUni = await prisma.contaPagar.findFirstOrThrow({ where: { fornecedor: `${MARCA} Unimed` } });
    const comprovante = await registrarDespesaDaMensagem({ extracao: { valor: 333, fornecedor: `${MARCA} Unimed`, categoria: categoria.nome }, texto: "", origem: "COMPROVANTE", identificador: tg, usuarioId: marcos.id });
    ok(!comprovante.registradaDireto && !comprovante.mensagem.includes("É o pagamento"), "comprovante vira rascunho, ainda sem a pergunta");
    const conf = await confirmarRascunho(comprovante.despesaId, tg);
    ok(conf.mensagem.includes("É o pagamento dela?") && dados(conf.botoes).includes(`pg:${contaUni.id}:${comprovante.despesaId}`) && dados(conf.botoes).includes(`d:u:${comprovante.despesaId}`), "ao confirmar: pergunta + botões (e o Desfazer)");
    await processarBotaoAgente({ identificador: tg, usuarioId: marcos.id, dados: `pg:${contaUni.id}:${comprovante.despesaId}` });
    ok((await prisma.contaPagar.findUniqueOrThrow({ where: { id: contaUni.id } })).despesaId === comprovante.despesaId, "botão 'É essa conta' liga");

    // 9. Push do banco: pergunta antes da confirmação; "Não é" volta ao resumo; "É essa conta" confirma com a categoria/centro da conta
    const destino = await destinatarioDosAvisos();
    const tgAdmin = `tg:${destino!.telegramId}`;
    await criarContaPagar({ fornecedor: `${MARCA} Aluguel`, vencimento: hoje, valorCentavos: 77701, categoriaId: outraCategoria.id, centroGeralId: centros[1].id, negocioId: null, repeticao: "UNICA", registradaPorId: marcos.id });
    const contaAlu = await prisma.contaPagar.findFirstOrThrow({ where: { fornecedor: `${MARCA} Aluguel` } });
    const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }).replace(",", " -");
    const push = await processarPushBancario({
      titulo: "Sicredi Pix",
      texto: `Você pagou um Pix no valor de R$ 777,01\n${MARCA} Imobiliaria Ltda CPF ###.111.222-##\nBanco Teste S.A.\n${agora.slice(0, 10)} - 10:07:07\nAproveite todas vantagens do Pix no Sicredi.`,
    });
    ok(push.status === "registrado", `push registrado (${push.status})`);
    if (push.status === "registrado") {
      avisos.push(push.avisoId);
      const aviso = await prisma.avisoBancario.findUniqueOrThrow({ where: { id: push.avisoId } });
      const despesaPush = aviso.despesaId!;
      ok(push.resposta.mensagem.includes("É o pagamento dela?") && dados(push.resposta.botoes).join() === `pg:${contaAlu.id}:${despesaPush},pn:${despesaPush}`, "push: só a pergunta, com É essa conta / Não é");
      const naoE = await processarBotaoAgente({ identificador: tgAdmin, usuarioId: marcos.id, dados: `pn:${despesaPush}` });
      ok(naoE?.resposta.includes("não é de conta a pagar") && dados(naoE?.botoes).includes(`d:ok:${despesaPush}`), "'Não é' mostra a confirmação normal da despesa");
      await processarBotaoAgente({ identificador: tgAdmin, usuarioId: marcos.id, dados: `pg:${contaAlu.id}:${despesaPush}` });
      const dp = await prisma.despesa.findUniqueOrThrow({ where: { id: despesaPush } });
      const alu = await prisma.contaPagar.findUniqueOrThrow({ where: { id: contaAlu.id } });
      ok(dp.status === "AGUARDANDO_CONCILIACAO" && dp.categoriaId === outraCategoria.id && dp.centroGeralId === centros[1].id, "despesa do push confirmada com a categoria e o centro da conta");
      ok(alu.status === "PAGA" && alu.despesaId === despesaPush, "conta paga com o push");
      const deNovo = await processarBotaoAgente({ identificador: tgAdmin, usuarioId: marcos.id, dados: `pg:${contaAlu.id}:${despesaPush}` });
      ok(deNovo?.resposta.includes("Já está ligada"), "tocar de novo não duplica");
    }

    // 10. Rascunho esquecido: aparece na aba, editar na tela não cria série, lançar cria
    const wa2 = `${wa}2`;
    const esq = await registrarContaDaMensagem({ extracao: { valor: 89.9, fornecedor: `${MARCA} Vivo`, categoria: categoria.nome, repeteTodoMes: true }, texto: "", origem: "TEXTO", identificador: wa2, usuarioId: marcos.id });
    const lista1 = (await listarRascunhosConta()).find((r) => r.id === esq.contaId);
    ok(lista1 && !lista1.vencimentoInformado && lista1.faltando.join() === "vencimento", `rascunho na aba, falta: ${lista1?.faltando.join()}`);
    await atualizarContaPagar(esq.contaId!, { vencimento: "2026-11-26", valorCentavos: 8990, fornecedor: `${MARCA} Vivo`, categoriaId: categoria.id, centroGeralId: centros[0].id, negocioId: null, repeteTodoMes: true });
    await gerarContasFixas();
    const editado = await prisma.contaPagar.findUniqueOrThrow({ where: { id: esq.contaId! } });
    ok(editado.status === "A_CONFIRMAR" && !editado.serieId && editado.repeteTodoMes && (await prisma.contaPagar.count({ where: { fornecedor: `${MARCA} Vivo` } })) === 1, "editar o rascunho na tela não cria série nem mês seguinte");
    ok((await listarRascunhosConta()).find((r) => r.id === esq.contaId)?.faltando.length === 0, "depois de editar, nada falta");
    await confirmarRascunhoConta(esq.contaId!, editado.telefoneOrigem!);
    const vivo = await prisma.contaPagar.findMany({ where: { fornecedor: `${MARCA} Vivo` }, orderBy: { vencimento: "asc" } });
    ok(vivo.length === 2 && vivo.every((c) => c.status === "ABERTA" && c.serieId === vivo[0].serieId) && diaBrasilia(vivo[1].vencimento) === "2026-12-26", `lançar: conta fixa com o mês seguinte (${vivo.map((c) => diaBrasilia(c.vencimento)).join()})`);
    await prisma.comandoAgente.deleteMany({ where: { identificador: wa2 } });
  } finally {
    const series = await prisma.contaPagar.findMany({ where: { OR: [{ fornecedor: { startsWith: MARCA } }, { telefoneOrigem: { in: [tg, wa] } }] }, select: { serieId: true } });
    const serieIds = series.map((s) => s.serieId).filter((s): s is string => Boolean(s));
    const contas = await prisma.contaPagar.deleteMany({ where: { OR: [{ fornecedor: { startsWith: MARCA } }, { telefoneOrigem: { in: [tg, wa] } }, { serieId: { in: serieIds } }] } });
    const avisosApagados = await prisma.avisoBancario.findMany({ where: { id: { in: avisos } }, select: { despesaId: true } });
    await prisma.avisoBancario.deleteMany({ where: { id: { in: avisos } } });
    const despesas = await prisma.despesa.deleteMany({
      where: { OR: [{ fornecedor: { contains: MARCA } }, { telefoneOrigem: { in: [tg, wa] } }, { id: { in: avisosApagados.map((a) => a.despesaId).filter((d): d is string => Boolean(d)) } }] },
    });
    const comandos = await prisma.comandoAgente.deleteMany({ where: { identificador: { in: [tg, wa] } } });
    const depois = { contas: await prisma.contaPagar.count(), despesas: await prisma.despesa.count() };
    console.log(`limpeza: ${contas.count} contas, ${despesas.count} despesas, ${avisos.length} avisos, ${comandos.count} comandos; depois:`, depois);
    ok(depois.contas === antes.contas && depois.despesas === antes.despesas, "contagens voltaram ao que eram");
    console.log(falhas ? `${falhas} FALHA(S)` : "TUDO OK");
    await prisma.$disconnect();
  }
}
void main();
