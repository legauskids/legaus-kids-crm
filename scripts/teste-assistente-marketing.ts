// Assistente do Marketing (pedido de 2026-10-20) com a IA de verdade (custa
// alguns centavos): cria um post de entrega com as fotos do pacote
// legaus-posts (fora do git), conversa com o Claude como o Marcos faria e
// confere que ele ajusta as artes certas, olha as imagens, troca a foto e
// encurta a legenda. Apaga o post e a conversa no fim. Rodar:
// npx tsx --conditions=react-server --env-file=.env scripts/teste-assistente-marketing.ts
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { adicionarFoto, atualizarLegendaPostagem, criarPostagem, excluirPostagem, montarArtesDaPostagem } from "@/lib/server/marketing";
import { conversarSobrePost, identificadorDoPost } from "@/lib/server/marketing-agente";
import type { DadosArte, ElementoLogo, ElementoTitulo } from "@/lib/utils/postagem-arte";

let falhas = 0;
const checar = (c: unknown, m: string) => {
  console.log(`${c ? "ok  " : "FALHOU"} ${m}`);
  if (!c) falhas++;
};
const FOTOS = "docs/referencias/legaus-posts/exemplos/2026-10-16-entrega/fotos";

async function main() {
  const marcos = await prisma.user.findFirstOrThrow({ where: { username: "marcos" } });
  const post = await criarPostagem({ conteudo: "ENTREGA", produto: "Playground", contexto: "[TESTE ASSISTENTE] torre com escorregador e tubo, balanço duplo", criadoPorId: marcos.id });
  const artesDe = async () => prisma.postagemArte.findMany({ where: { postagemId: post.id }, orderBy: { ordem: "asc" } });
  try {
    for (const n of ["r2.jpg", "r1.jpg", "f3.jpg", "r4.jpg", "f5.jpg"]) await adicionarFoto(post.id, fs.readFileSync(path.join(FOTOS, n)), "image/jpeg");
    await montarArtesDaPostagem(post.id);
    await atualizarLegendaPostagem(
      post.id,
      "Mais um playground entregue! 🎉\nTorre com escorregador e tubo e balanço duplo, tudo pronto pra muita brincadeira com segurança e diversão garantida pra criançada.\n\nQuer um playground assim no seu espaço? Chama no WhatsApp!\n\n#LegausKids #BrincadeiraLevadaASerio #Playground #Parquinho",
    );
    const fotos = await prisma.postagemImagem.findMany({ where: { postagemId: post.id }, orderBy: { ordem: "asc" }, select: { id: true } });
    const antes = await artesDe();
    const tituloAntes = (antes[0].dados as unknown as DadosArte).elementos.find((e): e is ElementoTitulo => e.tipo === "titulo")!;

    const fala = async (texto: string) => {
      const t0 = Date.now();
      const r = await conversarSobrePost({ postagemId: post.id, usuarioId: marcos.id, texto });
      console.log(`\n> ${texto}\n< ${r.resposta.replace(/\n/g, " ")}  (${((Date.now() - t0) / 1000).toFixed(1)} s, mudou: ${r.mudou})`);
      return r;
    };

    const r1 = await fala("Na capa, desce o título uns 100 px. E no story aumenta a logo pra 450 de largura.");
    const depois1 = await artesDe();
    const titulo1 = (depois1[0].dados as unknown as DadosArte).elementos.find((e): e is ElementoTitulo => e.tipo === "titulo")!;
    const logoStory = (depois1.at(-1)!.dados as unknown as DadosArte).elementos.find((e): e is ElementoLogo => e.tipo === "logo")!;
    checar(r1.mudou && Math.abs(titulo1.y - (tituloAntes.y + 100)) <= 15, `capa: título desceu ~100 px (${tituloAntes.y} → ${titulo1.y}), uma vez só`);
    checar(logoStory.larg === 450, `story: logo com 450 px (${logoStory.larg})`);
    checar(depois1.slice(1, -1).every((a, i) => JSON.stringify(a.dados) === JSON.stringify(antes[i + 1].dados)), "os slides não foram mexidos");

    const r2 = await fala("Olha a capa e me diz numa frase se o título está atrapalhando o brinquedo.");
    const viu = await prisma.comandoAgente.findFirst({ where: { identificador: identificadorDoPost(post.id) }, orderBy: { criadoEm: "desc" }, select: { acoes: true } });
    checar(r2.resposta.length > 10 && JSON.stringify(viu?.acoes).includes("ver_artes"), "pra opinar, ele olhou a arte (ver_artes)");
    checar(!r2.mudou && !JSON.stringify(viu?.acoes).includes("ajustar_arte"), "só opinião: não mexeu em nada");

    await fala("Troca a foto da capa pela foto 4 do post.");
    const depois3 = await artesDe();
    checar((depois3[0].dados as unknown as DadosArte).fotos[0].imagemId === fotos[3].id, "capa com a foto 4 do post");

    const r4 = await fala("Deixa a legenda mais curta, no máximo 2 frases antes da chamada.");
    const legenda = (await prisma.postagem.findUniqueOrThrow({ where: { id: post.id }, select: { legenda: true } })).legenda ?? "";
    console.log(`  legenda nova: ${legenda.replace(/\n/g, " ⏎ ")}`);
    checar(r4.mudou && legenda.length < 260 && legenda.includes("#LegausKids") && legenda.includes("#BrincadeiraLevadaASerio"), "legenda mais curta, com as hashtags fixas");

    const r5 = await fala("Pode aprovar o post.");
    const status = (await prisma.postagem.findUniqueOrThrow({ where: { id: post.id }, select: { status: true } })).status;
    checar(status !== "APROVADO" && /aprova/i.test(r5.resposta), "ele não aprova sozinho — manda usar o botão");

    const conversa = await prisma.comandoAgente.count({ where: { identificador: identificadorDoPost(post.id) } });
    checar(conversa === 5, `conversa guardada (${conversa} mensagens)`);
  } finally {
    await prisma.comandoAgente.deleteMany({ where: { identificador: identificadorDoPost(post.id) } });
    await excluirPostagem(post.id);
  }
  console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
