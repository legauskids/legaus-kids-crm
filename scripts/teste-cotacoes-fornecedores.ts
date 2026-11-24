// Cotações de fornecedores (2026-11-24), no banco, sem IA e sem mandar nada:
// salvar com arquivo em partes, fornecedor novo ou do cadastro, juntar prints
// seguidos, buscar por produto, corrigir, apagar (botão e conversa). Apaga
// tudo o que cria.
// Rodar:
// node --dns-result-order=ipv4first node_modules/tsx/dist/cli.mjs --conditions=react-server --env-file=.env scripts/teste-cotacoes-fornecedores.ts
import { prisma } from "@/lib/db";
import { processarBotaoAgente } from "@/lib/server/agente";
import {
  apagarCotacaoDaConversa,
  buscarItensCotados,
  corrigirCotacaoDaConversa,
  getArquivoCotacao,
  lerParteArquivoCotacao,
  listarCotacoesFornecedores,
  registrarCotacaoDaMensagem,
} from "@/lib/server/cotacoes-fornecedores";

globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, result: {} }))) as typeof fetch;

const MARCA = `TesteCF${Date.now() % 1000000}`;
const tg = `tg:TESTE-CF-${MARCA}`;
const wa = `5500${String(Date.now()).slice(-9)}`;
let falhas = 0;
const ok = (c: unknown, m: string) => {
  console.log(`${c ? "ok  " : "FALHOU"} ${m}`);
  if (!c) falhas++;
};
// CNPJ de teste com o fim único (não precisa ser válido).
const cnpj = `99${String(Date.now()).slice(-12)}`;

async function main() {
  const marcos = await prisma.user.findFirstOrThrow({ where: { isAdmin: true, telegramId: { not: null } }, select: { id: true } });
  const antes = { contatos: await prisma.contato.count(), cotacoes: await prisma.cotacaoFornecedor.count() };
  console.log("antes:", antes);
  const contatosCriados: string[] = [];
  // Um PDF "grande" (7 MB) pra testar as partes de 3 MB.
  const grande = Buffer.alloc(7 * 1024 * 1024, 7);
  grande.write("%PDF-1.4 cotacao", 0);

  try {
    // 1. PDF de fornecedor novo: salva direto, cria o fornecedor, guarda o arquivo em partes
    const r1 = await registrarCotacaoDaMensagem({
      extracao: {
        fornecedor: { nome: `${MARCA} Borrachas Sul Ltda`, cnpj, cidade: "Ijuí" },
        dataTexto: "20/11/2026",
        validadeTexto: "Validade: 10 dias",
        resumo: "Piso emborrachado 15 e 20mm",
        itens: [
          { descricao: "Piso emborrachado 15mm 50x50 preto", unidade: "m²", quantidade: 120, precoUnitario: 89.9, total: 10788 },
          { descricao: "Piso emborrachado 20mm 50x50 preto", unidade: "m²", precoUnitario: 109 },
        ],
        frete: "FOB",
        impostos: "IPI incluso",
        total: 10788,
        negocio: `${MARCA} obra que não existe`,
      },
      texto: "",
      origem: "ARQUIVO",
      identificador: tg,
      usuarioId: marcos.id,
      anexos: [{ bytes: grande, mime: "application/pdf", nome: "cotação borrachas.pdf" }],
    });
    const c1 = await prisma.cotacaoFornecedor.findUniqueOrThrow({ where: { id: r1.cotacaoId! }, include: { itens: { orderBy: { ordem: "asc" } }, arquivos: true, fornecedor: true } });
    if (c1.fornecedorId) contatosCriados.push(c1.fornecedorId);
    ok(c1.titulo === `${MARCA} Borrachas Sul Ltda · Piso emborrachado 15 e 20mm · nov/2026`, `nome fácil: ${c1.titulo}`);
    ok(c1.fornecedor?.tipo === "FORNECEDOR" && c1.fornecedor.cnpj === cnpj && c1.fornecedor.cidade === "Ijuí", "fornecedor novo no cadastro, com CNPJ e cidade");
    ok(c1.itens.length === 2 && c1.itens[0].precoUnitarioCentavos === 8990 && c1.itens[0].quantidade === 120 && c1.itens[1].totalCentavos === null, "itens como vieram");
    ok(c1.data.toISOString().startsWith("2026-11-20") && c1.validade?.toISOString().startsWith("2026-11-30"), "data e validade (10 dias)");
    ok(c1.frete === "FOB" && c1.impostos === "IPI incluso" && c1.totalCentavos === 1078800 && !c1.negocioId, "condições; obra não achada fica sem");
    ok(r1.mensagem.includes("(novo no cadastro de Fornecedores)") && r1.mensagem.includes("⚠️ Não achei um negócio só para"), "mensagem avisa fornecedor novo e obra não achada");
    const arq = await getArquivoCotacao(c1.arquivos[0].id);
    const partes = await Promise.all([0, 1, 2].map((i) => lerParteArquivoCotacao(c1.arquivos[0].id, i)));
    ok(arq?.partesTotal === 3 && Buffer.concat(partes.map((p) => Buffer.from(p!))).equals(grande), "arquivo de 7 MB em 3 partes, igual ao original");

    // 2. Print seguinte do mesmo fornecedor: junta na mesma (item repetido não duplica)
    const r2 = await registrarCotacaoDaMensagem({
      extracao: {
        fornecedor: { nome: `${MARCA} BORRACHAS SUL` },
        itens: [
          { descricao: "Piso emborrachado 15mm 50x50 preto", unidade: "m²", precoUnitario: 89.9 },
          { descricao: "Cola de contato galão 3,6L", unidade: "galão", precoUnitario: 145 },
        ],
        prazoEntrega: "15 dias úteis",
      },
      texto: "",
      origem: "ARQUIVO",
      identificador: tg,
      usuarioId: marcos.id,
      anexos: [{ bytes: Buffer.from("print2"), mime: "image/jpeg", nome: "cotacao.jpeg" }],
    });
    const c2 = await prisma.cotacaoFornecedor.findUniqueOrThrow({ where: { id: r1.cotacaoId! }, include: { itens: { orderBy: { ordem: "asc" } }, _count: { select: { arquivos: true } } } });
    ok(r2.cotacaoId === r1.cotacaoId && r2.mensagem.startsWith("✅ Juntei na cotação de fornecedor nº"), "print seguinte junta na mesma cotação");
    ok(c2.itens.length === 3 && c2.itens[2].descricao.startsWith("Cola") && c2._count.arquivos === 2 && c2.prazoEntrega === "15 dias úteis", "3 itens (sem repetir), 2 arquivos, prazo preenchido");

    // 3. Outro fornecedor na mesma conversa: cotação nova; fornecedor do cadastro é reaproveitado
    const r3 = await registrarCotacaoDaMensagem({
      extracao: { fornecedor: { nome: `${MARCA} Borrachas Sul Indústria e Comércio` }, itens: [{ descricao: "Piso de borracha 15 mm", unidade: "m2", precoUnitario: 79.5 }] },
      texto: "cotação de outra filial",
      origem: "ARQUIVO",
      identificador: wa,
      usuarioId: marcos.id,
      anexos: [],
    });
    const c3 = await prisma.cotacaoFornecedor.findUniqueOrThrow({ where: { id: r3.cotacaoId! } });
    ok(r3.cotacaoId !== r1.cotacaoId && c3.fornecedorId === c1.fornecedorId && !r3.mensagem.includes("novo no cadastro"), "outra conversa: cotação nova, mesmo fornecedor do cadastro");
    const r4 = await registrarCotacaoDaMensagem({
      extracao: { fornecedor: { nome: `${MARCA} Madeireira Pinheiro` }, itens: [{ descricao: "Piso emborrachado 15mm", unidade: "m²", precoUnitario: 95 }, { descricao: "Piso emborrachado 20 mm", unidade: "m²", precoUnitario: 99 }] },
      texto: "",
      origem: "TEXTO",
      identificador: wa,
      usuarioId: marcos.id,
      anexos: [],
    });
    const c4 = await prisma.cotacaoFornecedor.findUniqueOrThrow({ where: { id: r4.cotacaoId! } });
    if (c4.fornecedorId) contatosCriados.push(c4.fornecedorId);
    ok(r4.cotacaoId !== r3.cotacaoId, "fornecedor diferente na mesma conversa não junta");

    // 4. Busca: 15mm do mais parecido e mais barato; 20mm fica de fora; filtro de fornecedor
    const busca = await buscarItensCotados({ termos: ["piso emborrachado 15mm", "piso borracha 15mm"] });
    const nossos = busca.filter((i) => i.fornecedor.startsWith(MARCA));
    ok(nossos.map((i) => i.precoUnitarioCentavos).join() === "7950,8990,9500", `busca 15mm: ${nossos.map((i) => `${i.fornecedor.slice(MARCA.length + 1)} ${i.precoUnitarioCentavos}`).join(" | ")}`);
    ok(nossos.every((i) => !/20 ?mm/.test(i.descricao)), "20mm não aparece");
    const daMadeireira = await buscarItensCotados({ termos: [], fornecedor: `${MARCA} Madeireira Pinheiro` });
    ok(daMadeireira.length === 2 && daMadeireira.every((i) => i.fornecedor === `${MARCA} Madeireira Pinheiro`), "sem termos + fornecedor = tudo dele");
    const vencida = nossos.find((i) => i.numero === c1.numero);
    ok(vencida?.validade === "2026-11-30" && vencida.arquivoIds.length === 2, "item com validade e os arquivos da cotação");

    // 5. Corrigir pela conversa: preço, remover item, item novo, validade
    const corr = await corrigirCotacaoDaConversa({
      identificador: tg,
      texto: "o piso 20mm é 105, tira a cola e faltou o rodapé",
      correcao: { alterarItens: [{ item: 2, precoUnitario: 105 }, { item: 3, remover: true }], novosItens: [{ descricao: "Rodapé de borracha 1m", unidade: "un", precoUnitario: 32 }], validadeTexto: "15 dias" },
    });
    const c5 = await prisma.cotacaoFornecedor.findUniqueOrThrow({ where: { id: r1.cotacaoId! }, include: { itens: { orderBy: { ordem: "asc" } } } });
    ok(corr.mensagem.startsWith(`✏️ Corrigi a cotação de fornecedor nº ${c1.numero}:`), "resposta da correção");
    ok(c5.itens.map((i) => `${i.descricao.split(" ")[0]}:${i.precoUnitarioCentavos}`).join() === "Piso:8990,Piso:10500,Rodapé:3200", `itens corrigidos: ${c5.itens.map((i) => i.descricao).join(" | ")}`);
    ok(c5.validade?.toISOString().startsWith("2026-12-05"), "validade corrigida (15 dias da cotação)");
    ok(c5.itens[1].totalCentavos === null && c5.itens[0].totalCentavos === 1078800, "item sem quantidade não ganha total; o outro fica");
    const rSoma = await registrarCotacaoDaMensagem({
      extracao: { fornecedor: { nome: `${MARCA} Tubos Norte` }, itens: [{ descricao: "Tubo 1 pol", unidade: "m", quantidade: 10, precoUnitario: 20, total: 200 }, { descricao: "Curva 1 pol", unidade: "un", quantidade: 4, precoUnitario: 5, total: 20 }], total: 220 },
      texto: "",
      origem: "TEXTO",
      identificador: `${tg}soma`,
      usuarioId: marcos.id,
      anexos: [],
    });
    await corrigirCotacaoDaConversa({ identificador: `${tg}soma`, texto: "o tubo é 22", correcao: { alterarItens: [{ item: 1, precoUnitario: 22 }] } });
    const cSoma = await prisma.cotacaoFornecedor.findUniqueOrThrow({ where: { id: rSoma.cotacaoId! }, include: { itens: { orderBy: { ordem: "asc" } } } });
    ok(cSoma.itens[0].totalCentavos === 22000 && cSoma.totalCentavos === 24000, `preço corrigido recalcula o item (${cSoma.itens[0].totalCentavos}) e a soma da cotação (${cSoma.totalCentavos})`);
    const semCotacao = await corrigirCotacaoDaConversa({ identificador: "tg:ninguem", texto: "x", correcao: { frete: "CIF" } });
    ok(semCotacao.cotacaoId === null && semCotacao.mensagem.includes("Não achei cotação"), "sem cotação na conversa: avisa");

    // 6. Fornecedor não lido; nada lido e sem arquivo não salva
    const r6 = await registrarCotacaoDaMensagem({ extracao: { itens: [{ descricao: `${MARCA} Tela de proteção`, precoUnitario: 12 }] }, texto: "", origem: "TEXTO", identificador: `${wa}9`, usuarioId: marcos.id, anexos: [] });
    ok(r6.mensagem.includes("Fornecedor: Fornecedor não identificado") && r6.mensagem.includes("Não achei o nome do fornecedor"), "sem fornecedor: salva e pede o nome");
    const r7 = await registrarCotacaoDaMensagem({ extracao: {}, texto: "", origem: "TEXTO", identificador: `${wa}9`, usuarioId: marcos.id, anexos: [] });
    ok(r7.cotacaoId === null, "nada lido e sem arquivo: não salva");

    // 7. Apagar: botão de outra conversa é ignorado; da conversa apaga com itens e arquivos
    ok((await processarBotaoAgente({ identificador: "tg:outra", usuarioId: marcos.id, dados: `cfx:${r1.cotacaoId}` })) === null, "botão de outra conversa é ignorado");
    const arquivosAntes = await prisma.cotacaoFornecedorArquivo.findMany({ where: { cotacaoId: r1.cotacaoId! }, select: { id: true } });
    const apagou = await processarBotaoAgente({ identificador: tg, usuarioId: marcos.id, dados: `cfx:${r1.cotacaoId}` });
    ok(apagou?.resposta.startsWith(`🗑️ Apaguei a cotação de fornecedor nº ${c1.numero}`), "botão apagar");
    ok(
      !(await prisma.cotacaoFornecedor.findUnique({ where: { id: r1.cotacaoId! } })) &&
        (await prisma.cotacaoFornecedorItem.count({ where: { cotacaoId: r1.cotacaoId! } })) === 0 &&
        (await prisma.cotacaoFornecedorArquivoParte.count({ where: { arquivoId: { in: arquivosAntes.map((a) => a.id) } } })) === 0,
      "apagou itens, arquivos e partes junto",
    );
    ok((await processarBotaoAgente({ identificador: tg, usuarioId: marcos.id, dados: `cfx:${r1.cotacaoId}` }))?.resposta === "Essa cotação já tinha sido apagada.", "apagar de novo avisa");
    const r8 = await apagarCotacaoDaConversa(wa);
    ok(r8.cotacaoId === r4.cotacaoId, "'apaga essa cotação' apaga a última da conversa");

    // 8. Tela: a lista traz o que sobrou, mais recente primeiro
    const lista = (await listarCotacoesFornecedores()).filter((c) => c.fornecedorNome.startsWith(MARCA) || c.itens.some((i) => i.descricao.startsWith(MARCA)));
    ok(lista.length === 3 && lista.every((c) => !("bytes" in c)), `lista da aba: ${lista.length} cotações`);
  } finally {
    const cotacoes = await prisma.cotacaoFornecedor.deleteMany({ where: { telefoneOrigem: { in: [tg, wa, `${wa}9`, `${tg}soma`] } } });
    const contatos = await prisma.contato.deleteMany({ where: { OR: [{ id: { in: contatosCriados } }, { nome: { startsWith: MARCA } }] } });
    const depois = { contatos: await prisma.contato.count(), cotacoes: await prisma.cotacaoFornecedor.count() };
    console.log(`limpeza: ${cotacoes.count} cotações, ${contatos.count} fornecedores; depois:`, depois);
    ok(depois.contatos === antes.contatos && depois.cotacoes === antes.cotacoes, "contagens voltaram ao que eram");
    console.log(falhas ? `${falhas} FALHA(S)` : "TUDO OK");
    await prisma.$disconnect();
  }
}
void main();
