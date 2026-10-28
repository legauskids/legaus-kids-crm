// Nome do contato vindo do WhatsApp (2026-10-28): o contato que nasceu só
// com o telefone (1ª mensagem foi nossa) ganha o nome do perfil quando a
// pessoa responde; nome já salvo nunca é trocado. O nome salvo na agenda do
// celular troca na hora (menos cadastro com CNPJ) e vale mais que o do perfil
// ao criar contato. Usa números fictícios e apaga tudo no fim. Rodar:
// npx tsx --conditions=react-server --env-file=.env scripts/teste-nome-contato.ts
import { prisma } from "@/lib/db";
import { encontrarOuCriarConversaPorTelefone } from "@/lib/server/conversas";
import { aplicarNomesDaAgenda } from "@/lib/server/contatos";

let falhas = 0;
const checar = (c: unknown, m: string) => {
  console.log(`${c ? "ok  " : "FALHOU"} ${m}`);
  if (!c) falhas++;
};
const TEL_A = "5599000012345";
const TEL_B = "5599000012346";
const TEL_C = "5599000012348";
const TEL_FORA = "5599000012349";
const nomeDo = async (telefone: string) => (await prisma.contato.findUniqueOrThrow({ where: { telefone } })).nome;

async function limpar() {
  const contatos = await prisma.contato.findMany({ where: { telefone: { in: [TEL_A, TEL_B, TEL_C, TEL_FORA] } }, select: { id: true } });
  const ids = contatos.map((c) => c.id);
  await prisma.conversa.deleteMany({ where: { contatoId: { in: ids } } });
  await prisma.contato.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  const parecidos = await prisma.contato.count({ where: { OR: [{ telefone: { endsWith: "00012345" } }, { telefone: { endsWith: "00012346" } }, { telefone: { endsWith: "00012348" } }, { telefone: { endsWith: "00012349" } }] } });
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

    // 7. Agenda do celular: troca o nome do perfil; no formato sem o 55 também acha.
    let r = await aplicarNomesDaAgenda([{ telefone: TEL_B, nome: "  Ciclano   da Escola " }]);
    checar(r.atualizados === 1 && (await nomeDo(TEL_B)) === "Ciclano da Escola", "agenda do celular troca o nome do perfil");
    r = await aplicarNomesDaAgenda([{ telefone: "99000012346", nome: "Ciclano da Escola" }]);
    checar(r.iguais === 1, "mesmo nome no outro formato do número: nada muda");

    // 8. Cadastro com CNPJ mantém o nome; sem nome ainda, ganha o da agenda.
    await prisma.contato.update({ where: { telefone: TEL_A }, data: { nome: "Prefeitura Teste", cnpj: "00000000000191" } });
    r = await aplicarNomesDaAgenda([{ telefone: TEL_A, nome: "João da Prefeitura" }]);
    checar(r.protegidos === 1 && (await nomeDo(TEL_A)) === "Prefeitura Teste", "cadastro com CNPJ mantém o nome");
    await prisma.contato.update({ where: { telefone: TEL_A }, data: { nome: TEL_A } });
    r = await aplicarNomesDaAgenda([{ telefone: TEL_A, nome: "João da Prefeitura" }]);
    checar(r.atualizados === 1 && (await nomeDo(TEL_A)) === "João da Prefeitura", "cadastro com CNPJ ainda sem nome ganha o da agenda");

    // 9. Número fora do CRM não vira contato; nome sem letras é ignorado.
    r = await aplicarNomesDaAgenda([{ telefone: TEL_FORA, nome: "Tia Maria" }, { telefone: TEL_B, nome: "..." }]);
    checar(r.semCadastro === 1 && r.invalidos === 1 && (await prisma.contato.count({ where: { telefone: TEL_FORA } })) === 0, "número fora do CRM e nome sem letras: ignorados");

    // 10. Mensagem com nome da agenda: contato novo nasce com ele (vale mais que o perfil); nome salvo não muda.
    await encontrarOuCriarConversaPorTelefone({ telefone: TEL_C, nomeContato: "🌸 Perfil", nomeAgenda: "Beltrana Obra Centro" });
    checar((await nomeDo(TEL_C)) === "Beltrana Obra Centro", "contato novo com nome na agenda: nasce com o nome da agenda");
    await prisma.contato.update({ where: { telefone: TEL_C }, data: { nome: "Beltrana Corrigida no CRM" } });
    await encontrarOuCriarConversaPorTelefone({ telefone: TEL_C, nomeAgenda: "Beltrana Obra Centro" });
    checar((await nomeDo(TEL_C)) === "Beltrana Corrigida no CRM", "nome corrigido no CRM não volta pro da agenda a cada mensagem");
  } finally {
    await limpar();
  }
  console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
