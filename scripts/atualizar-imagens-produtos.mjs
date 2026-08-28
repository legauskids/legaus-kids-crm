// Preenche Produto.imagemUrl com as miniaturas reais do site
// (legauskids.com.br), levantadas em 2026-08-28. Os arrays abaixo seguem a
// MESMA ordem de listagem das páginas de categoria do site (e por isso a
// mesma ordem em que os produtos foram cadastrados em seed-produtos.mjs) —
// o pareamento é posicional dentro de cada categoria.
//
// Rodar: node scripts/atualizar-imagens-produtos.mjs

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = "https://www.legauskids.com.br/site2018/wp-content/uploads";

const IMAGENS = {
  Playground: [
    // invertido pra ordem ascendente (PL-001 -> PL-022) — o seed criou nessa
    // ordem, mas o site lista descendente (PL-022 primeiro); ficou trocado
    // na primeira rodada, corrigido aqui.
    "2018/04/A-300x169.jpg",
    "2018/04/B-300x169.jpg",
    "2018/04/C-300x169.jpg",
    "2018/04/D-300x169.jpg",
    "2018/04/E-300x169.jpg",
    "2018/04/F-300x169.jpg",
    "2018/04/PL-007-2-300x169.jpg",
    "2018/04/PL-008-2-300x169.jpg",
    "2018/04/I-300x169.jpg",
    "2018/04/PG-010-2019-13-300x169.jpg",
    "2018/09/pl011-7-300x169.jpg",
    "2018/09/PG-012-2019-14-300x169.jpg",
    "2019/02/PL013-10-300x169.jpg",
    "2019/02/PL14-14-300x169.jpg",
    "2019/02/PL15-14-300x169.jpg",
    "2019/02/PL-16-12-300x169.jpg",
    "2021/01/0211f56d-a2b5-4efa-a3e1-fd69091b0197-1-300x169.jpg",
    "2021/01/646ee4fd-329c-44b5-a6b5-a6e5435b7906-300x169.jpg",
    "2021/06/WhatsApp-Image-2021-04-13-at-15.06.55-1-300x169.jpeg",
    "2024/05/img-20210819-wa0000-300x169.jpg",
    "2024/05/img-20211008-wa0050-300x169.jpg",
    "2024/05/img-20210928-wa0035-300x145.jpg",
  ], // PL-001 -> PL-022

  "Parque Infantil": [
    "2024/05/gaiola-labirinto-p-12-300x169.jpg",
    "2024/05/moto-de-mola-21-300x169.jpg",
    "2019/02/Escada-Maluca-12-1-300x169.jpg",
    "2018/11/BVVLK04-13-300x169.jpg",
    "2018/11/BVVLK02-13-300x169.jpg",
    "2018/11/ttlk01-12-300x169.jpg",
    "2018/10/colk01-11-300x169.jpg",
    "2018/07/vai-e-vem-barco-viking-10-300x169.jpg",
    "2018/06/jogo-da-velha06-300x169.jpg",
    "2018/06/namk02-06-300x169.jpg",
    "2018/04/GGRLK06-12-300x169.jpg",
    "2018/04/VV-01-1-300x169.jpg",
    "2018/04/ES-25-1-300x169.jpg",
    "2018/04/ES-20-1-300x169.jpg",
    "2018/04/EH-03-1-300x169.jpg",
    "2018/04/EH-02-1-300x169.jpg",
    "2018/06/bablk03-10-300x169.jpg",
    "2018/04/BA-02-1-300x169.jpg",
    "2018/04/BA-01-1-300x169.jpg",
    "2018/04/GA-03-1-300x169.jpg",
    "2018/04/GA-02-1-300x169.jpg",
    "2018/04/GA-01-1-300x169.jpg",
  ],

  // Kidplay: o seed ficou em ordem alfabética/numérica (não a ordem do
  // site), então aqui é por código explícito em vez de posição.
  Kidplay: {
    __porCodigo: true,
    KP018: "2024/05/2022-07-260001-300x169.jpg",
    KP0155: "2024/05/7236f454-e571-4700-aa47-92a1b7572041-removebg-preview-300x189.png",
    KP015: "2024/05/2022-08-090001-1-300x169.jpg",
    KP019: "2024/05/1edd7cd6-8663-4d50-91a9-e5f6d41e49d7-removebg-preview-300x188.png",
    KP012: "2024/05/62023-01-17_6_-_foto-jpg-removebg-preview-300x169.png",
    KP020: "2024/05/417368bc-306c-4ae0-9453-d47a52ab75e7-removebg-preview-300x157.png",
    KP013: "2024/05/1906e7ab-24ba-4df4-bab9-58e8d6475ed5-removebg-preview-300x169.png",
    KP025: "2024/05/3-removebg-preview-300x169.png",
    KP04: "2024/05/51152ffe-4f84-4206-88bd-048bddc22fc1-removebg-preview-300x169.png",
    KP014: "2024/05/2022-02-02-b0001-300x169.jpg",
    KP011: "2024/05/047044a1-ec02-4d28-be54-ba478f39746e-removebg-preview-300x187.png",
    KP001: "2018/03/KPLK01-300x136.jpg",
    KP010: "2018/03/KPLK10-300x141.jpg",
    KP009: "2018/03/KPLK09-300x141.jpg",
    KP008: "2018/03/KPLK08-300x167.jpg",
    KP007: "2018/03/KPLK07-300x136.jpg",
    KP006: "2019/07/42bbd390-76d6-44db-b7cf-1f6b5f10811f-300x199.jpg",
    KP005: "2018/03/KPLK05-300x136.jpg",
    KP004: "2018/03/KPLK04-300x141.jpg",
    KP002: "2019/07/80a517e2-80ac-41f4-8483-958b7744053d-300x167.jpg",
    KP003: "2018/03/KPLK03-300x141.jpg",
  },

  Pisos: [
    "2019/05/img-20210426-wa0003-300x347.jpg",
    "2022/03/captura-de-tela-2022-03-24-115635.png",
    "2019/05/tapet.jpg",
    "2019/05/Kit-8-Tapetes-Infantil-Emborrachado-50x50-10mm-Tatame-Eva-sls-982787-MLB26133359276_102017-T.jpg",
    "2022/03/captura-de-tela-2022-03-24-114126.png",
    "2019/05/captura-de-tela-2022-03-24-113217.png",
    "2019/05/img-20210623-wa0012-300x400.jpg",
  ],

  "Academia Aberta": [
    "2018/08/ac001-13-300x169.jpg", "2018/08/ac002-13-300x169.jpg", "2018/08/ac003-13-300x169.jpg",
    "2018/08/ac004-13-300x169.jpg", "2018/08/ac005-13-300x169.jpg", "2018/08/ac06-300x169.jpg",
    "2018/08/ac007-10-300x169.jpg", "2018/08/ac008-10-300x169.jpg", "2018/08/ac009-10-300x169.jpg",
    "2018/08/ac010-10-300x169.jpg", "2018/08/ac011-10-300x169.jpg", "2018/08/ac012-13-300x169.jpg",
    "2018/08/ac013-10-300x169.jpg", "2018/08/ac014-10-300x169.jpg", "2018/08/ac015-10-300x169.jpg",
    "2018/08/ac016-10-300x169.jpg", "2018/08/ac01706-300x169.jpg", "2018/08/ac018-10-300x169.jpg",
    "2018/08/ac019-10-300x169.jpg", "2018/08/ac020-10-300x169.jpg", "2018/08/ac021-10-300x169.jpg",
    "2018/08/ac022-10-300x169.jpg", "2018/08/ac023-10-300x169.jpg", "2018/08/ac024-10-300x169.jpg",
    "2018/08/ac025-10-300x169.jpg", "2018/08/ac026-10-300x169.jpg", "2018/08/ac027-10-300x169.jpg",
    "2018/08/ac028-10-300x169.jpg", "2018/08/ac029-10-300x169.jpg", "2018/08/ac030-10-300x169.jpg",
    "2018/08/ac031-10-300x169.jpg", "2018/08/ac032-10-300x169.jpg", "2018/08/ac033-10-300x169.jpg",
    "2018/08/ac034-10-300x169.jpg", "2018/08/ac035-10-300x169.jpg", "2018/08/ac036-10-300x169.jpg",
    "2018/08/ac037-10-300x169.jpg", "2018/08/ac038-13-300x169.jpg", "2018/08/ac039-13-300x169.jpg",
    "2018/08/ac04006-300x169.jpg", "2018/08/ac04106-300x169.jpg",
  ], // AC001..AC041 em ordem

  Mobiliário: [
    "2021/12/cd1113e8-ee06-4c21-a69a-ae109ea4055a-300x169.jpg",
    "2019/06/mesa-cad-ferro-300x300.jpg",
    "2018/06/mesa-de-jogos06-300x169.jpg",
  ],

  "Outros Produtos": [
    "2018/09/estrutura-banner-maior-12-300x169.jpg",
    "2018/09/estrutura-banner-menor-16-300x169.jpg",
    "2018/06/mini-gol06-300x169.jpg",
    "2018/06/praca-senador04-300x169.jpg",
  ],

  "Parque Infantil Baby": [
    "2018/06/506-8-300x169.jpg",
    "2018/06/506-7-300x169.jpg",
    "2018/06/bablk03-10-300x169.jpg",
    "2018/06/0506-1-300x169.jpg",
    "2018/06/0506-300x169.jpg",
    "2018/06/506-5-300x169.jpg",
    "2018/06/506-4-300x169.jpg",
    "2018/06/506-3-300x169.jpg",
  ],

  "Parque Infantil PNE": [
    "2018/06/906-10-300x169.jpg",
    "2018/06/906-9-300x169.jpg",
    "2018/06/906-8-300x169.jpg",
    "2018/06/906-7-300x169.jpg",
    "2018/06/906-6-300x169.jpg",
  ],

  "Linha Rotomoldados": [
    // página 1 (24)
    "2021/07/ba42981bfc7696ed5acb284e70ac029b-300x222.jpg",
    "2020/09/mesa-sirizinho-09809-xalingo-300x300.jpg",
    "2020/09/biducav.jpg",
    "2020/09/gangorra-individual-pluto-xalingo-300x300.jpg",
    "2020/08/bainfam-300x451.jpg",
    "2020/08/baficher-300x416.jpg",
    "2020/08/bafofossauros-300x232.jpg",
    "2020/08/bamickey-300x309.jpg",
    "2020/08/baminnie-300x326.jpg",
    "2020/08/unic-300x352.jpg",
    "2020/08/21877199-balanco-infantil-aviao-vermelho-xalingo-brinquedos-7896640493431-2_zoom-1500x1500-300x300.jpg",
    "2019/10/ESCDESMONTAVELVERM.jpg",
    "2018/07/miniplay-27185-300x200.jpg",
    "2018/07/miniplay-festa-29202-300x200.jpg",
    "2018/07/miniplay-31219-300x200.jpg",
    "2018/07/escorregador-98104-300x346.jpg",
    "2018/07/escorregador-33331-300x268.jpg",
    "2018/07/escorregador-25156-300x200.jpg",
    "2018/06/chale-silver-30214-d-300x266.jpg",
    "2018/06/chale-royale-30214-a-300x200.jpg",
    "2018/06/chale-royalee-30214-b-png-300x200.jpg",
    "2018/06/casinhaaa-98101-a-png-300x281.jpg",
    "2018/06/casinha-petit-com-mesinha-36371-300x252.jpg",
    "2018/06/casinha-de-campoo-31229-a-png-300x263.jpg",
    // página 2 (24)
    "2018/06/casinha-de-caampoo-31229-c-png-300x225.jpg",
    "2018/06/casinha-de-campo-31229-b-300x241.jpg",
    "2018/06/casinha-98101-b-300x204.jpg",
    "2018/06/torre-castelo-balanco-35362-300x150.jpg",
    "2018/06/cerquinha-21122-300x234.jpg",
    "2018/06/tunel-ludico-20119-300x188.jpg",
    "2018/05/torre-do-castelo-35361-300x240.png",
    "2018/05/supremo-plus-24142-300x147.jpg",
    "2018/05/supremo-play-31228-300x178.jpg",
    "2018/05/supremo-24133-300x225.jpg",
    "2018/05/sprinter-27192-300x153.jpg",
    "2018/05/splendor-25151-300x130.jpg",
    "2018/05/skylab-27191-300x122.jpg",
    "2018/05/sideral-28199-300x194.jpg",
    "2018/05/mesinha-pic-nic-6l-36370-300x230.jpg",
    "2018/05/petit-play-standartt-33334-300x212.png",
    "2018/05/balancinho-jett-31215-300x300.png",
    "2018/05/assento-balancoo-99115-300x225.jpg",
    "2018/05/balanco-bebe-98105-300x300.jpg",
    "2018/05/tabela-basquete-98109-300x675.jpg",
    "2018/05/kit-multi-esporte-tabelaa-20120-png-300x200.jpg",
    "2018/05/gol-bola-98110-300x222.jpg",
    "2018/05/gol-dobravell-31217-300x231.jpg",
    "2018/05/casinha-petit-standard-36372-300x341.jpg",
    // página 3 (24)
    "2018/04/Royal-Play-C-1-300x188.jpg",
    "2018/04/Royal-Play-B-1-300x200.jpg",
    "2018/04/Royal-Play-A-1-300x192.jpg",
    "2018/04/Royal-Play-TOP-1-300x255.jpg",
    "2018/04/Royal-PH-com-KF-31222-B-300x200.jpg",
    "2018/04/Royal-PH-31222-A-300x180.jpg",
    "2018/04/Royal-Play-Fly-31220-300x200.jpg",
    "2018/04/Premium-Top-27184-300x185.jpg",
    "2018/04/Premium-Prata-27184-A-300x185.jpg",
    "2018/04/Premium-Ouro-27184-300x190.jpg",
    "2018/04/Premium-Diamante-300x237.jpg",
    "2018/04/Polaris-Festa-1-300x350.jpg",
    "2018/04/Polaris-1-300x170.jpg",
    "2018/04/MultiPlay-TOP-1-300x181.jpg",
    "2018/04/Multiplay-Petit-com-Kit-Play-House-e-Kit-Fly-Duplo-1.-300x200.jpg",
    "2018/04/Multiplay-Petit-com-Kit-Play-House-1-.-300x200.jpg",
    "2018/04/Multiplay-Petit-1-300x159.jpg",
    "2018/04/Multiplay-house-com-kit-fly-1-300x129.jpg",
    "2018/04/Miniplay-Festa-1-300x200.jpg",
    "2018/04/Mini-Play-Petit-1-300x268.jpg",
    "2018/04/Millenium-1-300x200.jpg",
    "2018/04/Magnum-1-300x154.jpg",
    "2018/04/Goldenplay-1-300x197.jpg",
    "2018/04/Exclusive-24144-300x189.jpg",
    // página 4 (16)
    "2018/04/Eclipse-25153-300x125.jpg",
    "2018/04/Discovery-27188-300x243.jpg",
    "2018/04/Columbia-29205-300x200.jpg",
    "2018/04/Century-24135-300x201.jpg",
    "2018/04/ROYAL-P-PLUS-300x123.jpg",
    "2018/04/Centro-Atividades-99114-300x231.jpg",
    "2018/04/calypso-25152-300x200.jpg",
    "2018/04/Balanço-Lado-a-Lado-35357-300x240.png",
    "2018/04/Balanço-Criança-991113-300x250.jpg",
    "2018/04/Atlantis-27183-300x109.jpg",
    "2018/04/Aquarius-Top-29204-B-300x141.jpg",
    "2018/04/Aquárius-29204-A-300x200.jpg",
    "2018/04/APOLO-1-300x166.jpg",
    "2018/04/Antares-28201-B-300x213.jpg",
    "2018/04/torrepetitbalanco-grande-35364-300x261.jpg",
    "2018/04/castelo-petitpetit-play-35360-300x300.jpg",
  ],
};

async function main() {
  let atualizados = 0;
  let semCorrespondencia = 0;

  for (const [categoria, mapa] of Object.entries(IMAGENS)) {
    const produtos = await prisma.produto.findMany({
      where: { categoria },
      orderBy: { createdAt: "asc" },
    });

    if (!Array.isArray(mapa) && mapa.__porCodigo) {
      // pareamento por código — não depende de ordem
      for (const produto of produtos) {
        const caminho = produto.codigo ? mapa[produto.codigo] : undefined;
        if (!caminho) {
          semCorrespondencia++;
          continue;
        }
        await prisma.produto.update({ where: { id: produto.id }, data: { imagemUrl: `${BASE}/${caminho}` } });
        atualizados++;
      }
      continue;
    }

    const urls = mapa;
    if (produtos.length !== urls.length) {
      console.warn(
        `Aviso: ${categoria} tem ${produtos.length} produtos no banco mas ${urls.length} imagens mapeadas — pareando pelos primeiros ${Math.min(produtos.length, urls.length)}.`,
      );
    }

    for (let i = 0; i < Math.min(produtos.length, urls.length); i++) {
      const imagemUrl = `${BASE}/${urls[i]}`;
      await prisma.produto.update({ where: { id: produtos[i].id }, data: { imagemUrl } });
      atualizados++;
    }
    semCorrespondencia += Math.max(0, produtos.length - urls.length);
  }

  console.log(`Produtos atualizados com imagem: ${atualizados}`);
  console.log(`Sem imagem correspondente: ${semCorrespondencia}`);
  await prisma.$disconnect();
}

main().catch(async (erro) => {
  console.error(erro);
  await prisma.$disconnect();
  process.exit(1);
});
