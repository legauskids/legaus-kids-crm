// Movimentação entre as contas da empresa (regra do Marcos de 2026-10-17):
// Pix do Sicredi pra Idezza e a outra ponta chegando pela InfinitePay viram
// TRANSFERENCIA, sem despesa e sem pergunta; Pix pra fornecedor continua
// virando despesa; no extrato, o lançamento com o CNPJ da Idezza já entra
// como "entre contas" e dá pra desfazer e marcar à mão. Sem IA e sem
// Telegram (quem manda a mensagem é a rota). Apaga tudo o que cria. Rodar:
// npx tsx --conditions=react-server --env-file=.env scripts/teste-movimentacao-entre-contas.ts
import { prisma } from "@/lib/db";
import { destinatarioDosAvisos, processarPushBancario } from "@/lib/server/push-bancario";
import { importarExtratoOfx, marcarTransferencia, reabrirTransacao } from "@/lib/server/conciliacao-bancaria";
import { diaBrasilia } from "@/lib/utils/brasilia";

let falhas = 0;
const checar = (c: unknown, m: string) => {
  console.log(`${c ? "ok  " : "FALHOU"} ${m}`);
  if (!c) falhas++;
};
const inicio = new Date();
const avisos: string[] = [];
const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }).replace(",", " -");
const pixSicredi = (valor: string, quem: string, doc: string) =>
  `Você pagou um Pix no valor de R$ ${valor}\n${quem} ${doc}\nCloudwalk Instituição De Pagamento E Servicos Ltda\n${agora}\nAproveite todas vantagens do Pix no Sicredi.`;
const hoje = diaBrasilia(new Date());
const ofxData = (dia: string) => dia.replace(/-/g, "") + "120000";
const linhaOfx = (fitId: string, valor: string, memo: string) =>
  `<STMTTRN>\n<TRNTYPE>OTHER\n<DTPOSTED>${ofxData(hoje)}\n<TRNAMT>${valor}\n<FITID>${fitId}\n<MEMO>${memo}\n</STMTTRN>`;
const ofx = Buffer.from(
  [
    "OFXHEADER:100",
    "<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>",
    `<DTSTART>${ofxData(hoje)}`,
    `<DTEND>${ofxData(hoje)}`,
    linhaOfx("TESTE-ENTRE-1", "-0.93", "PAGAMENTO PIX-PIX_DEB   56135764000149 IDEZZA COMERCIO LTDA"),
    linhaOfx("TESTE-ENTRE-2", "-0.94", "PAGAMENTO PIX-PIX_DEB   87687489000108 POSTO TESTE ENTRE CONTAS"),
    "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
  ].join("\n"),
);

async function main() {
  const destino = await destinatarioDosAvisos();
  if (!destino) throw new Error("sem destinatário dos avisos");
  let importacaoId: string | null = null;
  try {
    // 1. Sicredi -> Idezza (CNPJ no push): movimentação entre contas, sem despesa.
    const r1 = await processarPushBancario({ titulo: "Sicredi Pix", texto: pixSicredi("0,91", "Idezza Comercio Ltda", "CNPJ 56.135.764/0001-49") });
    if (r1.status !== "registrado") throw new Error(`push 1: ${r1.status}`);
    avisos.push(r1.avisoId);
    const a1 = await prisma.avisoBancario.findUniqueOrThrow({ where: { id: r1.avisoId } });
    checar(a1.status === "TRANSFERENCIA" && !a1.despesaId, "Sicredi -> Idezza: aviso TRANSFERENCIA, sem despesa");
    checar(r1.resposta.mensagem.includes("Movimentação entre contas") && !r1.resposta.botoes?.length, `mensagem sem botões: "${r1.resposta.mensagem.split("\n")[0]}"`);

    // 2. A outra ponta chega pela InfinitePay (só o nome).
    const r2 = await processarPushBancario({
      conta: "INFINITEPAY",
      titulo: null,
      texto: "Pix recebido de R$ 0,91! 💰✅\nVocê recebeu um Pix de GOLDLOG FABRICA E TRANSPORTES LTDA na sua conta InfinitePay!",
    });
    if (r2.status !== "registrado") throw new Error(`push 2: ${r2.status}`);
    avisos.push(r2.avisoId);
    const a2 = await prisma.avisoBancario.findUniqueOrThrow({ where: { id: r2.avisoId } });
    checar(a2.status === "TRANSFERENCIA" && a2.conta === "INFINITEPAY" && !a2.negocioId, "entrada na InfinitePay vinda da Goldlog: TRANSFERENCIA, sem pergunta de negócio");
    checar(r2.resposta.mensagem.includes("outra ponta") && !r2.resposta.botoes?.length, `reconhece a outra ponta: "${r2.resposta.mensagem.split("\n").pop()}"`);

    // 3. Pix pra fornecedor continua virando despesa.
    const r3 = await processarPushBancario({ titulo: "Sicredi Pix", texto: pixSicredi("0,92", "Fornecedor Teste Entre Contas", "CNPJ 11.222.333/0001-81") });
    if (r3.status !== "registrado") throw new Error(`push 3: ${r3.status}`);
    avisos.push(r3.avisoId);
    const a3 = await prisma.avisoBancario.findUniqueOrThrow({ where: { id: r3.avisoId } });
    checar(a3.status === "PENDENTE" && a3.despesaId, "Pix pra fornecedor segue virando despesa");

    // 4. Extrato: a linha com o CNPJ da Idezza já entra como entre contas.
    const imp = await importarExtratoOfx({ nomeArquivo: "[TESTE] entre contas.ofx", bytes: ofx, importadoPorId: destino.id });
    importacaoId = imp.importacaoId;
    const linhas = await prisma.transacaoBancaria.findMany({ where: { importacaoId }, orderBy: { valorCentavos: "asc" } });
    const [idezza, posto] = linhas;
    checar(imp.transferencias === 1 && idezza?.status === "TRANSFERENCIA" && posto?.status === "NAO_CONCILIADA", "extrato: só a linha da Idezza entra como movimentação entre contas");

    await reabrirTransacao(idezza.id);
    checar((await prisma.transacaoBancaria.findUniqueOrThrow({ where: { id: idezza.id } })).status === "NAO_CONCILIADA", "Desfazer volta a linha pra pendente");
    await marcarTransferencia(posto.id, destino.id);
    checar((await prisma.transacaoBancaria.findUniqueOrThrow({ where: { id: posto.id } })).status === "TRANSFERENCIA", "botão Entre contas marca à mão");
  } finally {
    const despesas = (await prisma.avisoBancario.findMany({ where: { id: { in: avisos } }, select: { despesaId: true } }))
      .map((a) => a.despesaId)
      .filter((id): id is string => Boolean(id));
    await prisma.avisoBancario.deleteMany({ where: { id: { in: avisos } } });
    await prisma.despesa.deleteMany({ where: { id: { in: despesas }, criadoEm: { gte: inicio } } });
    if (importacaoId) {
      await prisma.rateioTransacao.deleteMany({ where: { transacao: { importacaoId } } });
      await prisma.transacaoBancaria.deleteMany({ where: { importacaoId } });
      await prisma.extratoBancarioImportacao.delete({ where: { id: importacaoId } });
    }
  }
  console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
