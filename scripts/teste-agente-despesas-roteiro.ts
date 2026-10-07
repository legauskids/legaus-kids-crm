// Repete o 2º teste do Marcos (2026-10-07) sem IA nem WhatsApp, passando a
// extração que o modelo fez em cada passo. Rodar:
// npx tsx --conditions=react-server --env-file=.env scripts/teste-agente-despesas-roteiro.ts
import { prisma } from "@/lib/db";
import { registrarDespesaDaMensagem, corrigirDespesaDaConversa, responderEnquete } from "@/lib/server/despesa-agente";
import { OPCAO_CONFIRMAR, OPCAO_NEGOCIO } from "@/lib/utils/despesa-agente";

let falhas = 0;
const checar = (c: unknown, m: string) => {
  console.log(`${c ? "ok  " : "FALHOU"} ${m}`);
  if (!c) falhas++;
};
const TEL = "550000000000096";
const inicio = new Date();
const pdf = { bytes: Buffer.from("%PDF-1.4 comprovante de teste"), mime: "application/pdf", nome: "sicredi_teste.pdf" };
const audio = { bytes: Buffer.from("OggS audio de teste"), mime: "audio/ogg; codecs=opus", nome: "audio.ogg" };
const doTeste = () => prisma.despesa.findMany({ where: { telefoneOrigem: TEL, criadoEm: { gte: inicio } }, include: { negocio: true, categoria: true } });

async function main() {
  const marcos = await prisma.user.findFirstOrThrow({ where: { isAdmin: true }, orderBy: { createdAt: "asc" } });
  const ijui = await prisma.negocio.findFirstOrThrow({ where: { titulo: "Kidplay Escola Ijuí" } });

  // 1. PDF do posto
  const r1 = await registrarDespesaDaMensagem({
    extracao: { valor: 66, fornecedor: "Posto de Combustíveis Vaccari Ltda", dataTexto: "06/10/2026", categoria: "Veículos e combustível", centro: "Veículos" },
    texto: "Segue o PDF anexado.",
    origem: "COMPROVANTE",
    identificador: TEL,
    usuarioId: marcos.id,
    anexo: pdf,
  });
  checar(r1.enquete && !r1.registradaDireto, "PDF: resumo + enquete");

  // 2. "Lance essa despesa na categoria Veículos e Combustíveis." — não muda nada
  const r2 = await corrigirDespesaDaConversa({ identificador: TEL, correcao: { categoria: "Veículos e combustível" }, texto: "Lance essa despesa na categoria Veículos e Combustíveis." });
  checar(r2.mensagem.startsWith("Já está assim") && !r2.enquete, `correção que não muda nada: resposta curta, sem enquete ("${r2.mensagem}")`);

  // 3. Enquete: É de um negócio
  const r3 = await responderEnquete({ identificador: TEL, ref: `despesa:${r1.despesaId}`, opcao: OPCAO_NEGOCIO });
  checar(r3?.mensagem.startsWith("Qual negócio?"), "enquete pergunta qual negócio");

  // 4. "É do negócio KidPlay e julho." — transcrição errada
  const r4 = await corrigirDespesaDaConversa({ identificador: TEL, correcao: { centro: "KidPlay e julho" }, texto: "É do negócio KidPlay e julho." });
  checar(!r4.enquete && r4.mensagem.includes("Não encontrei") && r4.mensagem.includes("Kidplay Escola Ijuí"), `nome não encontrado: sugere os parecidos, sem resumo nem enquete ("${r4.mensagem.slice(0, 120)}...")`);

  // 5. "Kidplay e Jui é o negócio." — o modelo chamou registrar_despesa de novo
  const r5 = await registrarDespesaDaMensagem({
    extracao: { valor: 66, fornecedor: "Posto de Combustíveis Vaccari Ltda", dataTexto: "ontem", categoria: "Veículos e combustível", centro: "Kidplay Ijuí" },
    texto: "Kidplay e Jui é o negócio.",
    origem: "AUDIO",
    identificador: TEL,
    usuarioId: marcos.id,
    anexo: audio,
  });
  let ds = await doTeste();
  checar(ds.length === 1, `continua UMA despesa só (tem ${ds.length})`);
  checar(r5.despesaId === r1.despesaId && ds[0].negocioId === ijui.id, `o negócio entrou na mesma despesa (${ds[0]?.negocio?.titulo})`);
  checar(ds[0].anexoMime === "application/pdf" && ds[0].origem === "COMPROVANTE", "o PDF do comprovante continua sendo o arquivo da despesa");
  checar(r5.enquete?.ref === `despesa:${r1.despesaId}`, "uma enquete nova, da mesma despesa");

  // 6. Confirmar: registra e não tem "mais uma esperando"
  const r6 = await responderEnquete({ identificador: TEL, ref: `despesa:${r1.despesaId}`, opcao: OPCAO_CONFIRMAR });
  checar(r6?.mensagem.startsWith("✅ Registrado") && !r6.mensagem.includes("mais uma"), "Confirmar registra, sem outra esperando");

  // 7. O mesmo comprovante mandado de novo: avisa que parece a mesma
  const r7 = await registrarDespesaDaMensagem({
    extracao: { valor: 66, fornecedor: "Posto de Combustíveis Vaccari Ltda", dataTexto: "06/10/2026", categoria: "Veículos e combustível", centro: "Veículos" },
    texto: "Segue o PDF anexado.",
    origem: "COMPROVANTE",
    identificador: TEL,
    usuarioId: marcos.id,
    anexo: pdf,
  });
  checar(r7.mensagem.startsWith("⚠️ Parece a mesma despesa já registrada") && !r7.registradaDireto, "mesmo comprovante de novo: avisa que parece a mesma");

  // 8. Texto com tudo dito, igual a uma já registrada: não registra direto
  const r8 = await registrarDespesaDaMensagem({
    extracao: { valor: 66, fornecedor: "Posto Vaccari", categoria: "Veículos e combustível", centro: "Veículos" },
    texto: "66 reais no posto Vaccari ontem, categoria veículos e combustível, centro de custo veículos",
    origem: "TEXTO",
    identificador: "550000000000095",
    usuarioId: marcos.id,
  });
  checar(!r8.registradaDireto && r8.mensagem.startsWith("⚠️"), "mesmo com tudo dito, despesa repetida não registra direto");
}

main()
  .catch((e) => {
    console.error(e);
    falhas++;
  })
  .finally(async () => {
    await prisma.despesa.deleteMany({ where: { criadoEm: { gte: inicio }, telefoneOrigem: { in: [TEL, "550000000000095"] } } });
    console.log("sobras:", await prisma.despesa.count({ where: { telefoneOrigem: { in: [TEL, "550000000000095"] } } }));
    await prisma.$disconnect();
    console.log(falhas ? `${falhas} falha(s)` : "tudo ok");
  });
