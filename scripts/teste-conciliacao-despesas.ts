// Teste da etapa 2 (conciliação extrato x despesas) direto no banco, com
// linhas e despesas de teste ([TESTE] / FITID TESTE-DESP-*) apagadas no fim.
// Rodar: npx tsx --conditions=react-server --env-file=.env scripts/teste-conciliacao-despesas.ts
import { prisma } from "@/lib/db";
import {
  importarExtratoOfx,
  getPainelConciliacao,
  confirmarPar,
  rejeitarPar,
  classificarSaida,
  classificarEntrada,
  reabrirTransacao,
  ignorarTransacao,
} from "@/lib/server/conciliacao-bancaria";
import { candidatosDaLinha } from "@/lib/utils/pares-despesa";
import { diaBrasilia, somarDias } from "@/lib/utils/brasilia";
import { dataDaDespesa } from "@/lib/utils/despesas";

let falhas = 0;
function checar(cond: unknown, msg: string) {
  console.log(`${cond ? "ok  " : "FALHOU"} ${msg}`);
  if (!cond) falhas++;
}
async function deveFalhar(p: Promise<unknown>, msg: string) {
  try {
    await p;
    checar(false, `${msg} (não falhou)`);
  } catch (e) {
    checar(true, `${msg} — "${e instanceof Error ? e.message.split("\n").pop() : e}"`);
  }
}

const hoje = diaBrasilia(new Date());
const ofxData = (dia: string) => dia.replace(/-/g, "") + "120000";
const linhaOfx = (fitId: string, dia: string, valor: string, memo: string) =>
  `<STMTTRN>\n<TRNTYPE>OTHER\n<DTPOSTED>${ofxData(dia)}\n<TRNAMT>${valor}\n<FITID>${fitId}\n<MEMO>${memo}\n</STMTTRN>`;
const ofx = Buffer.from(
  [
    "OFXHEADER:100",
    "<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>",
    `<DTSTART>${ofxData(somarDias(hoje, -5))}`,
    `<DTEND>${ofxData(hoje)}`,
    linhaOfx("TESTE-DESP-1", somarDias(hoje, -1), "-250.00", "COMPRA CARTAO DEB POSTO IPIRANGA"),
    linhaOfx("TESTE-DESP-2", somarDias(hoje, -1), "-1840.00", "PIX ENVIADO MADEIREIRA PINHEIRO LTDA"),
    linhaOfx("TESTE-DESP-3", somarDias(hoje, -1), "-39.90", "TARIFA PACOTE SERVICOS"),
    linhaOfx("TESTE-DESP-4", somarDias(hoje, -3), "6500.00", "PIX RECEBIDO COND RES BELA VISTA"),
    linhaOfx("TESTE-DESP-5", somarDias(hoje, -2), "123.45", "RENDIMENTO APLICACAO"),
    "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
  ].join("\n"),
);

async function main() {
  const marcos = await prisma.user.findFirstOrThrow({ where: { isAdmin: true }, orderBy: { createdAt: "asc" } });
  const veiculos = await prisma.centroCusto.findUniqueOrThrow({ where: { nome: "Veículos e combustível" } });
  const materia = await prisma.centroCusto.findUniqueOrThrow({ where: { nome: "Matéria-prima e insumos" } });
  const tarifas = await prisma.centroCusto.findUniqueOrThrow({ where: { nome: "Tarifas bancárias e juros" } });
  const negocio = await prisma.negocio.findFirstOrThrow({ orderBy: { updatedAt: "desc" } });

  const base = { registradaPorId: marcos.id, status: "AGUARDANDO_CONCILIACAO" as const, confirmadaEm: new Date() };
  const d1 = await prisma.despesa.create({
    data: { ...base, data: dataDaDespesa(somarDias(hoje, -2)), valorCentavos: 25000, fornecedor: "[TESTE] Posto Ipiranga", origem: "AUDIO", categoriaId: veiculos.id, centroGeralId: "cg-veiculos" },
  });
  const d3 = await prisma.despesa.create({
    data: { ...base, data: dataDaDespesa(hoje), valorCentavos: 25000, fornecedor: "[TESTE] Posto Shell", origem: "TEXTO", categoriaId: veiculos.id, centroGeralId: "cg-veiculos" },
  });
  const d2 = await prisma.despesa.create({
    data: { ...base, data: dataDaDespesa(somarDias(hoje, -2)), valorCentavos: 184000, fornecedor: "[TESTE] Madeireira Pinheiro", origem: "COMPROVANTE", categoriaId: materia.id, negocioId: negocio.id },
  });
  const totalDespesasAntes = await prisma.despesa.count();

  // a. importação: nada conciliado, pares contados
  const imp = await importarExtratoOfx({ nomeArquivo: "[TESTE] extrato.ofx", bytes: ofx, importadoPorId: marcos.id });
  checar(imp.novasImportadas === 5 && imp.paresProvaveis === 2, `importou 5 linhas e achou 2 saídas com par (${JSON.stringify(imp)})`);
  const linhas = await prisma.transacaoBancaria.findMany({ where: { fitId: { startsWith: "TESTE-DESP-" } }, orderBy: { fitId: "asc" } });
  const [t1, t2, t3, t4, t5] = linhas;
  checar(linhas.every((l) => l.status === "NAO_CONCILIADA"), "nenhuma linha conciliada sozinha na importação");

  // b. reimportar o mesmo arquivo não duplica (FITID)
  const imp2 = await importarExtratoOfx({ nomeArquivo: "[TESTE] extrato.ofx", bytes: ofx, importadoPorId: marcos.id });
  checar(imp2.novasImportadas === 0 && imp2.duplicadasIgnoradas === 5, "reimportar o mesmo OFX não duplica nada");

  // c. pares da linha do posto: Ipiranga (fornecedor parecido) antes do Shell
  let painel = await getPainelConciliacao(null);
  const linhaT1 = () => {
    const t = painel.pendentes.find((p) => p.id === t1.id)!;
    return candidatosDaLinha({ id: t.id, dia: diaBrasilia(t.data), descricao: t.descricao, valorCentavos: t.valorCentavos, tipo: t.tipo }, painel.despesas, new Set(t.paresRejeitados.map((r) => r.despesaId)));
  };
  checar(linhaT1().map((c) => c.despesa.id).join() === [d1.id, d3.id].join(), "posto: Ipiranga primeiro, Shell depois");
  await rejeitarPar(t1.id, d3.id, marcos.id);
  await rejeitarPar(t1.id, d3.id, marcos.id); // repetir não quebra
  painel = await getPainelConciliacao(null);
  checar(linhaT1().map((c) => c.despesa.id).join() === d1.id, "'Não é esse' tira o Shell dessa linha");

  // d. confirmar par: vincula a despesa existente, não cria outra
  await confirmarPar(t1.id, d1.id, marcos.id);
  const d1Depois = await prisma.despesa.findUniqueOrThrow({ where: { id: d1.id } });
  const t1Depois = await prisma.transacaoBancaria.findUniqueOrThrow({ where: { id: t1.id }, include: { rateios: true } });
  checar(d1Depois.status === "CONCILIADA" && d1Depois.transacaoId === t1.id, "despesa do posto conciliada com a linha");
  checar(
    t1Depois.status === "CONCILIADA" && t1Depois.rateios.length === 1 && t1Depois.rateios[0].centroCustoId === veiculos.id && t1Depois.rateios[0].centroGeralId === "cg-veiculos",
    "linha conciliada com categoria + centro geral da despesa",
  );
  checar((await prisma.despesa.count()) === totalDespesasAntes, "confirmar o par não criou despesa nova");

  // e. anti-duplicação
  await deveFalhar(confirmarPar(t1.id, d3.id, marcos.id), "segunda despesa na mesma linha é recusada");
  await deveFalhar(confirmarPar(t2.id, d1.id, marcos.id), "despesa já conciliada não pareia de novo");
  await deveFalhar(confirmarPar(t3.id, d3.id, marcos.id), "valor diferente é recusado");
  await deveFalhar(prisma.despesa.update({ where: { id: d3.id }, data: { transacaoId: t1.id } }), "o banco impede duas despesas na mesma linha (único)");

  // f. par com despesa de projeto
  await confirmarPar(t2.id, d2.id, marcos.id);
  const t2Depois = await prisma.transacaoBancaria.findUniqueOrThrow({ where: { id: t2.id }, include: { rateios: true } });
  checar(t2Depois.rateios[0]?.negocioId === negocio.id && t2Depois.negocioId === negocio.id, "despesa de obra vira custo do projeto");

  // g. saída sem despesa: classificar cria a despesa (origem extrato) já conciliada
  await deveFalhar(classificarSaida(t3.id, { fornecedor: "Sicredi", categoriaId: tarifas.id, centroGeralId: null, negocioId: null }, marcos.id), "classificar sem centro é recusado");
  await classificarSaida(t3.id, { fornecedor: "Sicredi", categoriaId: tarifas.id, centroGeralId: "cg-administrativo", negocioId: null }, marcos.id);
  const d4 = await prisma.despesa.findUnique({ where: { transacaoId: t3.id } });
  checar(d4?.origem === "EXTRATO" && d4.status === "CONCILIADA" && d4.valorCentavos === 3990, "tarifa classificada: despesa de origem extrato, conciliada");

  // h. entradas
  await classificarEntrada(t4.id, { negocioId: negocio.id, centroGeralId: null }, marcos.id);
  await classificarEntrada(t5.id, { negocioId: null, centroGeralId: "cg-administrativo" }, marcos.id);
  const t5Depois = await prisma.transacaoBancaria.findUniqueOrThrow({ where: { id: t5.id }, include: { rateios: { include: { centroCusto: true } } } });
  checar(t5Depois.status === "CONCILIADA" && t5Depois.rateios[0]?.centroCusto?.tipo === "RECEITA" && t5Depois.rateios[0]?.centroGeralId === "cg-administrativo", "entrada no centro geral, com categoria de receita");
  await deveFalhar(classificarEntrada(t1.id, { negocioId: negocio.id, centroGeralId: null }, marcos.id), "saída não entra como entrada");

  // i. desfazer
  await reabrirTransacao(t1.id);
  const d1Desfeito = await prisma.despesa.findUniqueOrThrow({ where: { id: d1.id } });
  const t1Desfeito = await prisma.transacaoBancaria.findUniqueOrThrow({ where: { id: t1.id }, include: { rateios: true } });
  checar(d1Desfeito.status === "AGUARDANDO_CONCILIACAO" && d1Desfeito.transacaoId === null, "desfazer o par: despesa volta para aguardando");
  checar(t1Desfeito.status === "NAO_CONCILIADA" && t1Desfeito.rateios.length === 0, "desfazer o par: linha volta a pendente sem rateio");
  await reabrirTransacao(t3.id);
  checar((await prisma.despesa.count({ where: { id: d4!.id } })) === 0, "desfazer a classificação apaga a despesa criada a partir do extrato");
  await ignorarTransacao(t2.id, marcos.id);
  const d2Depois = await prisma.despesa.findUniqueOrThrow({ where: { id: d2.id } });
  checar(d2Depois.status === "AGUARDANDO_CONCILIACAO" && d2Depois.transacaoId === null, "ignorar a linha solta a despesa (volta a aguardar)");
  await confirmarPar(t1.id, d1.id, marcos.id);
  checar((await prisma.despesa.findUniqueOrThrow({ where: { id: d1.id } })).status === "CONCILIADA", "dá pra confirmar o par de novo depois de desfazer");
  checar((await prisma.despesa.count()) === totalDespesasAntes, "no fim, nenhuma despesa a mais que as 3 de teste");
}

async function limpar() {
  const linhas = await prisma.transacaoBancaria.findMany({ where: { fitId: { startsWith: "TESTE-DESP-" } }, select: { id: true } });
  const ids = linhas.map((l) => l.id);
  await prisma.despesa.deleteMany({ where: { OR: [{ fornecedor: { startsWith: "[TESTE]" } }, { transacaoId: { in: ids } }] } });
  await prisma.transacaoBancaria.deleteMany({ where: { id: { in: ids } } });
  await prisma.extratoBancarioImportacao.deleteMany({ where: { nomeArquivo: "[TESTE] extrato.ofx" } });
  const sobras =
    (await prisma.despesa.count({ where: { fornecedor: { startsWith: "[TESTE]" } } })) +
    (await prisma.transacaoBancaria.count({ where: { fitId: { startsWith: "TESTE-DESP-" } } })) +
    (await prisma.extratoBancarioImportacao.count({ where: { nomeArquivo: "[TESTE] extrato.ofx" } }));
  console.log("sobras de teste:", sobras, "| linhas reais:", await prisma.transacaoBancaria.count());
}

main()
  .catch((e) => {
    console.error(e);
    falhas++;
  })
  .finally(async () => {
    await limpar();
    await prisma.$disconnect();
    console.log(falhas ? `${falhas} falha(s)` : "tudo ok");
  });
