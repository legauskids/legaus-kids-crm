// Brinquedos sempre inteiros na arte e edição de foto por IA (26/10/2026),
// com as fotos reais do pacote legaus-posts (docs/referencias, fora do git).
// Cria um post de teste e apaga no fim. O enquadramento usa o Claude de
// verdade (centavos); com --com-edicao também edita 1 foto no gpt-image-2
// (~1 min, alguns centavos) e volta ao original. Rodar:
// npx tsx --conditions=react-server --env-file=.env scripts/teste-enquadramento-fotos.ts [--com-edicao] [pasta de saída]
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import {
  adicionarFoto,
  criarPostagem,
  editarFotosComIA,
  enquadrarBrinquedosNasArtes,
  excluirPostagem,
  imagemDaArte,
  montarArtesDaPostagem,
  restaurarFotosOriginais,
  trocarFotosPorSlide,
} from "@/lib/server/marketing";
import { recorteDaFoto, type DadosArte } from "@/lib/utils/postagem-arte";

let falhas = 0;
const checar = (c: unknown, m: string) => {
  console.log(`${c ? "ok  " : "FALHOU"} ${m}`);
  if (!c) falhas++;
};
const COM_EDICAO = process.argv.includes("--com-edicao");
const SAIDA = process.argv.slice(2).find((a) => !a.startsWith("--"));
const FOTOS = "docs/referencias/legaus-posts/exemplos/2026-10-16-entrega/fotos";

async function artesDo(postagemId: string) {
  return (await prisma.postagemArte.findMany({ where: { postagemId }, orderBy: { ordem: "asc" }, select: { id: true, ordem: true, formato: true, dados: true, imagem: true } })).map((a) => ({
    ...a,
    dados: a.dados as unknown as DadosArte,
  }));
}

async function main() {
  if (!fs.existsSync(FOTOS)) throw new Error(`Faltam as fotos de exemplo em ${FOTOS} (pacote legaus-posts).`);
  const marcos = await prisma.user.findFirstOrThrow({ where: { username: "marcos" } });
  const post = await criarPostagem({ conteudo: "ENTREGA", produto: "playground", contexto: "[TESTE] enquadramento e edição por IA", criadoPorId: marcos.id, fotosPorSlide: 1 });
  try {
    for (const nome of ["r2.jpg", "r1.jpg", "f3.jpg", "r4.jpg"]) await adicionarFoto(post.id, fs.readFileSync(path.join(FOTOS, nome)), "image/jpeg");
    const imagens = await prisma.postagemImagem.findMany({ where: { postagemId: post.id }, orderBy: { ordem: "asc" }, select: { id: true, largura: true, altura: true } });
    const dim = (id: string) => {
      const i = imagens.find((x) => x.id === id)!;
      return { largura: i.largura!, altura: i.altura! };
    };

    // 1. Montar as artes já enquadra nos brinquedos.
    const t0 = Date.now();
    await montarArtesDaPostagem(post.id);
    console.log(`     (montar com o Claude achando os brinquedos: ${Date.now() - t0} ms)`);
    let artes = await artesDo(post.id);
    const comAlvo = artes.flatMap((a) => a.dados.fotos).filter((f) => f.alvo);
    checar(comAlvo.length === artes.flatMap((a) => a.dados.fotos).length, `todas as fotos das artes sabem onde estão os brinquedos (${comAlvo.length})`);
    const slidesLargos = artes.filter((a) => a.formato === "FEED" && a.ordem > 0 && dim(a.dados.fotos[0].imagemId).largura > dim(a.dados.fotos[0].imagemId).altura);
    checar(slidesLargos.length >= 2 && slidesLargos.every((a) => a.dados.fotos[0].zoom < 1), `fotos deitadas nos slides de 1 foto diminuem pra caber (zoom ${slidesLargos.map((a) => a.dados.fotos[0].zoom).join(", ")})`);
    // Os brinquedos (com a folga) ficam dentro do que aparece em cada arte.
    const dentro = artes.every((a) =>
      a.dados.fotos.every((f) => {
        const d = dim(f.imagemId);
        const r = recorteDaFoto(d, f);
        const [bx0, , bx1] = f.alvo!;
        const visivel0 = r.left - r.dx;
        const visivel1 = r.left - r.dx + r.w;
        return bx0 * r.rw >= visivel0 - 2 && bx1 * r.rw <= visivel1 + 2;
      }),
    );
    checar(dentro, "em todas as artes os brinquedos aparecem inteiros na largura");
    for (const a of artes) {
      const img = await imagemDaArte(a.id);
      if (SAIDA && img) fs.writeFileSync(path.join(SAIDA, `enquadrado-${a.ordem + 1}.jpg`), img.buffer);
    }
    checar(true, "as artes com foto diminuída (fundo desfocado) desenham sem erro");

    // 2. Reenquadrar de novo não muda nada e não pergunta ao Claude de novo (usa o que já sabe).
    const t1 = Date.now();
    const de_novo = await enquadrarBrinquedosNasArtes(post.id);
    checar(de_novo.mudancas.length === 0 && Date.now() - t1 < 2500, `reenquadrar o que já está enquadrado: nada muda, sem nova consulta (${Date.now() - t1} ms)`);

    // 3. Trocar pra 2 fotos por slide: os slides novos já vêm enquadrados, com o que já se sabia.
    await trocarFotosPorSlide(post.id, 2);
    artes = await artesDo(post.id);
    checar(artes.filter((a) => a.formato === "FEED" && a.ordem > 0).every((a) => a.dados.fotos.every((f) => f.alvo)), "slides de 2 fotos: já nascem enquadrados");

    // 4. Assistente mexeu no zoom na mão: enquadrar_brinquedos volta a mostrar os brinquedos.
    const slide = artes.find((a) => a.formato === "FEED" && a.ordem === 1)!;
    await prisma.postagemArte.update({ where: { id: slide.id }, data: { dados: { ...slide.dados, fotos: slide.dados.fotos.map((f) => ({ ...f, zoom: 2.5, fx: 0 })) } as never } });
    const volta = await enquadrarBrinquedosNasArtes(post.id, [1]);
    checar(volta.mudancas.length >= 1 && volta.mudancas.every((m) => m.depois.zoom < 2.5), "foto ampliada demais: enquadrar volta a mostrar os brinquedos");

    if (COM_EDICAO) {
      // 5. Edição por IA: a foto muda, mesmo tamanho, as artes dela são redesenhadas; voltar ao original desfaz.
      const alvo = imagens[1];
      const antes = await prisma.postagemImagem.findUniqueOrThrow({ where: { id: alvo.id }, select: { imagemTratada: true } });
      await Promise.all((await artesDo(post.id)).map((a) => imagemDaArte(a.id)));
      const t2 = Date.now();
      const r = await editarFotosComIA({ postagemId: post.id, imagemIds: [alvo.id], instrucao: "trocar a terra em volta dos brinquedos por grama igual à do gramado" });
      console.log(`     (edição por IA: ${((Date.now() - t2) / 1000).toFixed(0)} s)`);
      const depois = await prisma.postagemImagem.findUniqueOrThrow({ where: { id: alvo.id }, select: { imagemTratada: true, largura: true, altura: true } });
      checar(r.editadas.join() === "2" && r.falhas.length === 0, `editou a foto 2${r.falhas.length ? ` (${r.falhas.join("; ")})` : ""}`);
      checar(!Buffer.from(depois.imagemTratada!).equals(Buffer.from(antes.imagemTratada!)) && depois.largura === alvo.largura && depois.altura === alvo.altura, "a foto editada substitui a tratada, no mesmo tamanho");
      const artesDaFoto = (await artesDo(post.id)).filter((a) => a.dados.fotos.some((f) => f.imagemId === alvo.id));
      checar(artesDaFoto.length > 0 && artesDaFoto.every((a) => !a.imagem) && r.artes.length === artesDaFoto.length, "as artes com a foto vão ser redesenhadas");
      if (SAIDA) fs.writeFileSync(path.join(SAIDA, "foto-editada.jpg"), Buffer.from(depois.imagemTratada!));
      await restaurarFotosOriginais(post.id, [alvo.id]);
      const restaurada = await prisma.postagemImagem.findUniqueOrThrow({ where: { id: alvo.id }, select: { imagemTratada: true } });
      checar(Buffer.from(restaurada.imagemTratada!).equals(Buffer.from(antes.imagemTratada!)), "voltar ao original devolve exatamente a foto de antes");
    }
  } finally {
    await excluirPostagem(post.id);
  }
  console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
