// Cadastro de produto com foto pelo agente — o fluxo do Marcos de
// 2026-10-13 (foto numa mensagem, texto em outra, "sim", trocar foto,
// desfazer, duas fotos seguidas) com a IA de verdade (custa alguns
// centavos). Conversa de teste, apaga tudo o que cria. Rodar:
// npx tsx --conditions=react-server --env-file=.env scripts/teste-produtos-fotos.ts
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { processarComandoAgente } from "@/lib/server/agente";

let falhas = 0;
const checar = (c: unknown, m: string) => {
  console.log(`${c ? "ok  " : "FALHOU"} ${m}`);
  if (!c) falhas++;
};
const TEL = "550000000000098";
const inicio = new Date();
const NOME = "Playground Teste Foto Agente";
const quadrado = async (cor: string) =>
  (await sharp({ create: { width: 400, height: 300, channels: 3, background: cor } }).jpeg().toBuffer()).toString("base64");
const curta = (t: string) => t.replace(/\s+/g, " ").slice(0, 110);

async function main() {
  const marcos = await prisma.user.findFirstOrThrow({ where: { username: "marcos" } });
  const enviar = (texto: string, imagem?: string) =>
    processarComandoAgente({ texto, origem: "WHATSAPP", identificador: TEL, usuarioId: marcos.id, anexoImagem: imagem ? { base64: imagem, mimetype: "image/jpeg" } : undefined });
  const vermelho = await quadrado("#d32f2f");
  const azul = await quadrado("#1976d2");
  const produtos = () => prisma.produto.findMany({ where: { nome: { contains: "Teste Foto Agente" }, ativo: true } });

  // 1. Foto sozinha, depois o texto (como o WhatsApp entrega)
  const r1 = await enviar("Segue a imagem anexada.", vermelho);
  const guardada = await prisma.comandoAgente.count({ where: { identificador: TEL, anexoImagem: { not: null } } });
  checar(guardada === 1, `foto sem pedido fica guardada na conversa ("${curta(r1.resposta)}")`);
  const r2 = await enviar(`${NOME}\n1 Torre com telhado\n1 Escorregador reto\n1 Jogo da velha\nR$ 1.234,00`);
  let lista = await produtos();
  checar(lista.length === 1 && lista[0].nome === NOME && lista[0].valorCentavos === 123400, `texto do produto: cadastrado direto, com o nome exato e o preço ("${curta(r2.resposta)}")`);
  checar(lista[0]?.imagemMime === "image/jpeg", "a foto da mensagem anterior foi anexada");
  checar((await prisma.comandoAgente.count({ where: { identificador: TEL, anexoImagem: { not: null } } })) === 0, "foto usada sai da memória da conversa");

  // 2. "sim" não duplica
  const r3 = await enviar("sim");
  lista = await produtos();
  checar(lista.length === 1, `"sim" depois do cadastro não cria outro ("${curta(r3.resposta)}")`);
  const fotoVermelha = Buffer.from(lista[0].imagemBytes as Uint8Array);

  // 3. Trocar a foto de quem já tem foto pede confirmação
  const r4 = await enviar(`troca a foto do ${NOME} por essa`, azul);
  const pendente = await prisma.comandoAgente.findFirst({ where: { identificador: TEL, status: "AGUARDANDO_CONFIRMACAO" }, orderBy: { criadoEm: "desc" } });
  const aindaVermelha = Buffer.from((await produtos())[0].imagemBytes as Uint8Array);
  checar(pendente?.ferramentaPendente === "anexar_foto_produto" && aindaVermelha.equals(fotoVermelha), `troca de foto espera confirmação ("${curta(r4.resposta)}")`);
  const r5 = await enviar("sim");
  const depoisTroca = (await produtos())[0];
  checar(!Buffer.from(depoisTroca.imagemBytes as Uint8Array).equals(fotoVermelha) && Buffer.from(depoisTroca.imagemAnteriorBytes as Uint8Array).equals(fotoVermelha), `"sim" troca e guarda a anterior ("${curta(r5.resposta)}")`);

  // 4. Desfazer volta a anterior
  const r6 = await enviar(`desfaz, essa foto era de outro produto`);
  checar(Buffer.from((await produtos())[0].imagemBytes as Uint8Array).equals(fotoVermelha), `desfazer volta a foto de antes ("${curta(r6.resposta)}")`);

  // 5. Duas fotos seguidas e um pedido de um produto só: pergunta qual
  await enviar("Segue a imagem anexada.", vermelho);
  await enviar("Segue a imagem anexada.", azul);
  const r7 = await enviar("Balanço Teste Foto Agente\n1 Balanço duplo\nR$ 990,00");
  const balanco = (await produtos()).find((p) => p.nome.startsWith("Balanço"));
  const ultimo = await prisma.comandoAgente.findFirst({ where: { identificador: TEL }, orderBy: { criadoEm: "desc" } });
  const perguntouFoto = ((ultimo?.acoes ?? []) as { ferramenta: string }[]).some((a) => a.ferramenta === "anexar_foto_produto") && !balanco?.imagemMime;
  checar(balanco && perguntouFoto, `duas fotos seguidas: cadastra e pergunta qual foto usar ("${curta(r7.resposta)}")`);
}

main()
  .catch((erro) => {
    console.error(erro);
    falhas++;
  })
  .finally(async () => {
    await prisma.produto.deleteMany({ where: { nome: { contains: "Teste Foto Agente" }, createdAt: { gte: inicio } } });
    await prisma.comandoAgente.deleteMany({ where: { identificador: TEL, criadoEm: { gte: inicio } } });
    console.log(`sobras: ${await prisma.produto.count({ where: { nome: { contains: "Teste Foto Agente" } } })}`);
    console.log(falhas ? `${falhas} FALHA(S)` : "tudo ok");
    await prisma.$disconnect();
    process.exit(falhas ? 1 : 0);
  });
