// Posts do Instagram (etapa 1, 2026-10-17): cria um post de entrega com as
// fotos reais da entrega de 16/10 (pacote em docs/referencias/legaus-posts,
// fora do git), trata as fotos, monta e desenha as artes, refaz com outro
// título e — com --com-ia — pede a legenda à IA de verdade (custa alguns
// centavos). Grava as artes em [pasta de saída] pra conferir a olho. Apaga o
// post no fim. Rodar:
// npx tsx --conditions=react-server --env-file=.env scripts/teste-posts-instagram.ts [--com-ia] [pasta de saída]
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import {
  adicionarFoto,
  atualizarTextosPostagem,
  criarPostagem,
  excluirPostagem,
  gerarLegendaDaPostagem,
  imagemDaArte,
  montarArtesDaPostagem,
} from "@/lib/server/marketing";

let falhas = 0;
const checar = (c: unknown, m: string) => {
  console.log(`${c ? "ok  " : "FALHOU"} ${m}`);
  if (!c) falhas++;
};
const COM_IA = process.argv.includes("--com-ia");
const SAIDA = process.argv.slice(2).find((a) => !a.startsWith("--"));
const FOTOS = "docs/referencias/legaus-posts/exemplos/2026-10-16-entrega/fotos";

async function main() {
  if (!fs.existsSync(FOTOS)) throw new Error(`Faltam as fotos de exemplo em ${FOTOS} (pacote legaus-posts).`);
  const marcos = await prisma.user.findFirstOrThrow({ where: { username: "marcos" } });
  const post = await criarPostagem({ conteudo: "ENTREGA", produto: "playground", contexto: "[TESTE] torre com escorregador e tubo, balanço duplo", criadoPorId: marcos.id });
  try {
    for (const nome of ["r1.jpg", "r2.jpg", "f3.jpg", "r4.jpg", "f5.jpg"]) {
      await adicionarFoto(post.id, fs.readFileSync(path.join(FOTOS, nome)), "image/jpeg");
    }
    const fotos = await prisma.postagemImagem.findMany({ where: { postagemId: post.id }, select: { largura: true, altura: true, imagemTratada: true } });
    checar(fotos.length === 5 && fotos.every((f) => f.imagemTratada && f.largura && f.altura), "5 fotos tratadas, com largura e altura");

    const n = await montarArtesDaPostagem(post.id);
    const artes = await prisma.postagemArte.findMany({ where: { postagemId: post.id }, orderBy: { ordem: "asc" } });
    checar(n === artes.length && artes.map((a) => a.formato).join(",") === "FEED,FEED,FEED,STORY", `entrega: capa + 2 slides + story (${artes.map((a) => a.formato).join(",")})`);
    const status = (await prisma.postagem.findUniqueOrThrow({ where: { id: post.id } })).status;
    checar(status === "AGUARDANDO_APROVACAO", "post vai pra aguardando aprovação");

    const t0 = Date.now();
    for (const a of artes) {
      const r = await imagemDaArte(a.id);
      const meta = r ? await sharp(r.buffer).metadata() : null;
      const esperado = a.formato === "STORY" ? 1920 : 1350;
      checar(meta?.format === "jpeg" && meta.width === 1080 && meta.height === esperado, `arte ${a.ordem + 1} em JPEG 1080×${esperado}`);
      if (SAIDA && r) fs.writeFileSync(path.join(SAIDA, `post-teste-${a.ordem + 1}.jpg`), r.buffer);
    }
    console.log(`     (desenhar as 4 artes: ${Date.now() - t0} ms)`);
    const guardada = await prisma.postagemArte.findFirstOrThrow({ where: { id: artes[0].id } });
    checar(guardada.imagem && guardada.renderizadaEm, "a arte desenhada fica guardada (a segunda abertura não redesenha)");

    await atualizarTextosPostagem(post.id, { titulo: ["Entrega de", "Gangorra"], selos: ["Diversão Garantida"], argumentos: [] });
    const refeita = await prisma.postagemArte.findFirstOrThrow({ where: { postagemId: post.id, ordem: 0 } });
    const titulo = (refeita.dados as { elementos: { tipo: string; linhas?: { t: string }[] }[] }).elementos.find((e) => e.tipo === "titulo");
    checar(!refeita.imagem && titulo?.linhas?.[1]?.t === "Gangorra", "trocar o título refaz as artes (sem a imagem velha)");

    if (COM_IA) {
      const legenda = await gerarLegendaDaPostagem(post.id);
      console.log(`     legenda:\n${(legenda ?? "").replace(/^/gm, "       ")}`);
      checar(legenda?.includes("#LegausKids") && legenda.includes("#BrincadeiraLevadaASerio") && /whatsapp/i.test(legenda), "legenda com as hashtags fixas e a chamada pro WhatsApp");
    }
  } finally {
    await excluirPostagem(post.id);
  }
  checar((await prisma.postagemArte.count({ where: { postagemId: post.id } })) === 0, "excluir o post apaga fotos e artes");
  console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
