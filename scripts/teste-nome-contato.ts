// Nome do contato vindo do WhatsApp (2026-10-28): o contato que nasceu só
// com o telefone (1ª mensagem foi nossa) ganha o nome do perfil quando a
// pessoa responde; nome já salvo nunca é trocado. Usa números fictícios e
// apaga tudo no fim. Rodar:
// npx tsx --conditions=react-server --env-file=.env scripts/teste-nome-contato.ts
import { prisma } from "@/lib/db";
import { encontrarOuCriarConversaPorTelefone } from "@/lib/server/conversas";

let falhas = 0;
const checar = (c: unknown, m: string) => {
  console.log(`${c ? "ok  " : "FALHOU"} ${m}`);
  if (!c) falhas++;
};
const TEL_A = "5599000012345";
const TEL_B = "5599000012346";
const nomeDo = async (telefone: string) => (await prisma.contato.findUniqueOrThrow({ where: { telefone } })).nome;

async function limpar() {
  const contatos = await prisma.contato.findMany({ where: { telefone: { in: [TEL_A, TEL_B] } }, select: { id: true } });
  const ids = contatos.map((c) => c.id);
  await prisma.conversa.deleteMany({ where: { contatoId: { in: ids } } });
  await prisma.contato.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  const parecidos = await prisma.contato.count({ where: { OR: [{ telefone: { endsWith: "00012345" } }, { telefone: { endsWith: "00012346" } }] } });
  if (parecidos > 0) throw new Error("Já existe contato com os números fictícios do teste — confira antes de rodar.");
  try {
    // 1. A primeira mensagem é nossa (sem nome do perfil): o contato nasce com o telefone.
    const conversa = await encontrarOuCriarConversaPorTelefone({ telefone: TEL_A });
    checar((await nomeDo(TEL_A)) === TEL_A, "1ª mensagem nossa: contato nasce só com o telefone");

    // 2. Perfil sem nome de verdade (".") não vira nome.
    await encontrarOuCriarConversaPorTelefone({ telefone: TEL_A, nomeContato: " . " });
    checar((await nomeDo(TEL_A)) === TEL_A, 'perfil "." não vira nome');

    // 3. A pessoa responde: o nome do perfil preenche o contato, na mesma conversa.
    const depois = await encontrarOuCriarConversaPorTelefone({ telefone: TEL_A, nomeContato: "  Fulana Teste " });
    checar((await nomeDo(TEL_A)) === "Fulana Teste" && depois.id === conversa.id, "resposta da pessoa: contato ganha o nome do perfil (mesma conversa)");

    // 4. Nome já salvo nunca é trocado pelo perfil.
    await encontrarOuCriarConversaPorTelefone({ telefone: TEL_A, nomeContato: "Outro Nome" });
    checar((await nomeDo(TEL_A)) === "Fulana Teste", "nome já salvo não é trocado");

    // 5. O mesmo celular em outro formato (sem o 55) também é preenchido, sem duplicar.
    await prisma.contato.update({ where: { telefone: TEL_A }, data: { nome: TEL_A } });
    await encontrarOuCriarConversaPorTelefone({ telefone: "99000012345", nomeContato: "Fulana Outro Formato" });
    checar((await nomeDo(TEL_A)) === "Fulana Outro Formato" && (await prisma.contato.count({ where: { telefone: { endsWith: "00012345" } } })) === 1, "mesmo celular em outro formato: preenche o mesmo contato");

    // 6. Contato novo que já chega falando: nasce com o nome do perfil.
    await encontrarOuCriarConversaPorTelefone({ telefone: TEL_B, nomeContato: "Ciclano Teste" });
    checar((await nomeDo(TEL_B)) === "Ciclano Teste", "contato novo que escreve primeiro: nasce com o nome");
  } finally {
    await limpar();
  }
  console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
