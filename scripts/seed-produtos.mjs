// Popula a tabela Produto com o catálogo público da Legaus Kids
// (legauskids.com.br), levantado em 2026-08-28. Nome e código vêm do site;
// descrição e valor ficam em branco de propósito — Marcos/Dani preenchem
// depois direto na aba Produtos do CRM.
//
// Rodar uma vez: node scripts/seed-produtos.mjs
// Rodar de novo é seguro — produtos já cadastrados (mesmo nome+categoria)
// são pulados, não duplicados.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CATALOGO = {
  Playground: Array.from({ length: 22 }, (_, i) => {
    const numero = String(i + 1).padStart(3, "0");
    return { nome: `Playground PL-${numero}`, codigo: `PL-${numero}` };
  }),

  "Parque Infantil": [
    { nome: "Gaiola Labirinto P", codigo: "GL-P" },
    { nome: "Brinquedo mola Moto", codigo: "BM-01" },
    { nome: "Escala Maluca", codigo: "EM-02" },
    { nome: "Balanço Vai e Vem 4 Lugares", codigo: "BV-02" },
    { nome: "Balanço Vai e Vem 2 Lugares", codigo: "BV-01" },
    { nome: "Escada Meia Lua", codigo: "EM-01" },
    { nome: "Centro Olímpico", codigo: "CA-02" },
    { nome: "Vai e Vem – Barco Viking – 4 Lugares", codigo: "VV-02" },
    { nome: "Jogo da velha", codigo: "JG-01" },
    { nome: "Namoradeira", codigo: "BC-05" },
    { nome: "Gira Gira 6 Lugares", codigo: "GG-06" },
    { nome: "Vai e Vem", codigo: null },
    { nome: "Escorregador 2,5 Mt", codigo: "ES-25" },
    { nome: "Escorregador 2,0 Mt", codigo: "ES-20" },
    { nome: "Escada horizontal 3 mt", codigo: "EH-03" },
    { nome: "Escada horizontal 2 mt", codigo: "EH-02" },
    { nome: "Balanço 3 lugares", codigo: "BA-03" },
    { nome: "Balanço 2 lugares", codigo: "BA-02" },
    { nome: "Balanço 1 lugar", codigo: "BA-01" },
    { nome: "Gangorra 3 pranchas", codigo: "GA-03" },
    { nome: "Gangorra 2 pranchas", codigo: "GA-02" },
    { nome: "Gangorra 1 prancha", codigo: "GA-01" },
  ],

  Kidplay: [
    "KP001", "KP002", "KP003", "KP004", "KP005", "KP006", "KP007", "KP008", "KP009", "KP010",
    "KP011", "KP012", "KP013", "KP014", "KP015", "KP0155", "KP018", "KP019", "KP020", "KP025", "KP04",
  ].map((codigo) => ({ nome: `Kidplay ${codigo}`, codigo })),

  Pisos: [
    { nome: "Grama Sintética SoftGrass", codigo: null },
    { nome: "Piso de borracha Meia Lua", codigo: null },
    { nome: "Piso emborrachado - E.V.A alfabeto", codigo: null },
    { nome: "Piso emborrachado - E.V.A", codigo: null },
    { nome: "Piso de Borracha Square", codigo: null },
    { nome: "Piso de Borracha Ossinho", codigo: null },
    { nome: "Grama Sintética Soft Grass", codigo: null },
  ],

  "Academia Aberta": [
    ["AC001", "Barra Alongamento"],
    ["AC002", "Barra Fixa"],
    ["AC003", "Barras Alongamento (Jogo)"],
    ["AC004", "Placa Orientativa"],
    ["AC005", "Cadeira Fortalecimento Pernas 1 Usuário"],
    ["AC006", "Cadeira Fortalecimento Pernas 2 Usuários"],
    ["AC007", "Elíptico 1 Usuário"],
    ["AC008", "Elíptico 2 Usuários"],
    ["AC009", "Elíptico 3 Usuários"],
    ["AC010", "Prancha Surf 1 Usuário"],
    ["AC011", "Prancha Surf 2 Usuários"],
    ["AC012", "Prancha Abdominal 1 Usuário"],
    ["AC013", "Simulador Bicicleta 1 Usuário"],
    ["AC014", "Simulador Bicicleta 2 Usuários"],
    ["AC015", "Simulador Bicicleta 3 Usuários"],
    ["AC016", "Simulador Caminhada 1 Usuário"],
    ["AC017", "Simulador Caminhada 2 Usuários"],
    ["AC018", "Simulador Caminhada 3 Usuários"],
    ["AC019", "Simulador de Cavalgada 1 Usuário"],
    ["AC020", "Simulador de Cavalgada 2 Usuários"],
    ["AC021", "Simulador de Cavalgada 3 Usuários"],
    ["AC022", "Simulador Escada 1 Usuário"],
    ["AC023", "Simulador Escada 2 Usuários"],
    ["AC024", "Simulador Escada 3 Usuários"],
    ["AC025", "Simulador Esqui 1 Usuário"],
    ["AC026", "Simulador Esqui 2 Usuários"],
    ["AC027", "Simulador Esqui 3 Usuários"],
    ["AC028", "Simulador Remo 1 Usuário"],
    ["AC029", "Simulador Remo 2 Usuários"],
    ["AC030", "Simulador Remo 3 Usuários"],
    ["AC031", "Volante Rotação Diagonal 1 Usuário"],
    ["AC032", "Volante Rotação Diagonal 2 Usuários"],
    ["AC033", "Volante Rotação Vertical 1 Usuário"],
    ["AC034", "Volante Rotação Vertical 2 Usuários"],
    ["AC035", "Remada PNE"],
    ["AC036", "Puxada Alta PNE"],
    ["AC037", "Voador Peitoral e Dorsal PNE"],
    ["AC038", "Espaldar"],
    ["AC039", "Barra Paralela"],
    ["AC040", "Barra Marinheiro"],
    ["AC041", "Multi Alongador"],
  ].map(([codigo, nome]) => ({ nome, codigo })),

  Mobiliário: [
    { nome: "Banco de jardim-praça", codigo: null },
    { nome: "Mesa infantil c/ cadeiras de ferro", codigo: null },
    { nome: "Mesa de jogos com banco", codigo: "BC-06" },
  ],

  "Outros Produtos": [
    { nome: "Suporte Banner Maior", codigo: "SB-02" },
    { nome: "Suporte Banner Menor", codigo: "SB-01" },
    { nome: "Arco futebol infantil", codigo: "JG-03" },
    { nome: "Cerca modular para parques", codigo: null },
  ],

  "Parque Infantil Baby": [
    { nome: "Gira Gira Baby 6 Lugares", codigo: "GG-06-B" },
    { nome: "Vai e Vem Baby", codigo: "VV-01-B" },
    { nome: "Balanço Baby 3 lugares", codigo: "BA-03-B" },
    { nome: "Balanço Baby 2 lugares", codigo: "BA-02-B" },
    { nome: "Balanço Baby 1 lugar", codigo: "BA-01-B" },
    { nome: "Gangorra Baby 3 pranchas", codigo: "GA-03-B" },
    { nome: "Gangorra Baby 2 pranchas", codigo: "GA-02-B" },
    { nome: "Gangorra Baby 1 prancha", codigo: "GA-01-B" },
  ],

  "Parque Infantil PNE": [
    { nome: "Gira Gira PNE modelo 1", codigo: "GG-06-P" },
    { nome: "Vai e Vem PNE", codigo: "VV-01-P" },
    { nome: "Balanço PNE modelo 3", codigo: "BA-03-P" },
    { nome: "Balanço PNE modelo 2", codigo: "BA-02-P" },
    { nome: "Balanço PNE modelo 1", codigo: "BA-1-P" },
  ],

  "Linha Rotomoldados": [
    ["Cavalinho pequeno - individual", null],
    ["Mesa Sirizinho", null],
    ["Gangorra Bidu - Turma da Mônica", null],
    ["Gangorra Pluto", null],
    ["Balanço infantil", null],
    ["Balanço Leãozinho Fisher-Price", null],
    ["Balanço Fofossauros", null],
    ["Balanço Mickey", null],
    ["Balanço Minnie", null],
    ["Balanço Unicórnio", null],
    ["Balanço Avião", null],
    ["Escorregador Desmontável", null],
    ["Miniplay Plus", "27185"],
    ["Miniplay Festa", "29202"],
    ["Miniplay Fly", "31219"],
    ["Escorregador Reto", "98104"],
    ["Escorregador Curvo Pequeno", "33331"],
    ["Escorregador Curvo", "25156"],
    ["Chalé Royale Silver", "30214-D"],
    ["Chalé Royale Gold sem Cerquinha", "30214-A"],
    ["Chalé Royale Gold com Cerquinha", "30214-B"],
    ["Casinha sem Cerquinha", "98101-A"],
    ["Casinha Petit com mesinha e banquinho", "36371"],
    ["Casinha de Campo Standart", "31229-A"],
    ["Casinha de Campo com Kit Fly", "31229-C"],
    ["Casinha de Campo com Cerquinha", "31229-B"],
    ["Casinha com Cerquinha", "98101-B"],
    ["Torre do Castelo + Balanço", "35362"],
    ["Cerquinha com Florzinha", "21122"],
    ["Túnel Lúdico", "20119"],
    ["Torre do Castelo", "35361"],
    ["Supremo Plus", "24142"],
    ["Supremo Play House", "31228"],
    ["Supremo", "24133"],
    ["Sprinter", "27192"],
    ["Splendor", "25151"],
    ["Skylab", "27191"],
    ["Sideral", "28199"],
    ["Mesinha Pic-Nic 6 lugares", "36370"],
    ["Petit Play Standart", "33334"],
    ["Balancinho Jet", "31215"],
    ["Assento Balanço Criança", "99115"],
    ["Balanço Bebê", "98105"],
    ["Tabela de Basquete com bola", "98109"],
    ["Kit Multi-Esporte", "20120"],
    ["Gol, com bola", "98110"],
    ["Gol Dobrável", "31217"],
    ["Casinha Petit Standard", "36372"],
    ["Royal Play-C c/1 escorregador", "23130-C"],
    ["Royal Play-B c/2 escorregadores", "23130-B"],
    ["Royal Play-A com 1 escorregador + escada", "23130-A"],
    ["Royal Play TOP", "31222-C"],
    ["Royal Play House com Kit Fly", "31222-B"],
    ["Royal Play House", "31222-A"],
    ["Royal Play Fly", "31220"],
    ["Premium Top", "27184-D"],
    ["Premium Prata", "27184-A"],
    ["Premium Ouro", "27184-B"],
    ["Premium Diamante", "27184-C"],
    ["Polaris Festa com 1 tubo", "29206-B"],
    ["Polaris", "29206"],
    ["MultiPlay TOP", "31223-C"],
    ["Multiplay Petit + Play House + Kit Fly Duplo", "37384"],
    ["Multiplay Petit + Play House", "37383"],
    ["Multiplay Petit", "37382"],
    ["Multiplay House com Kit Fly", "31223B"],
    ["Multiplay Festa", "29203"],
    ["Mini Play Petit", "37385"],
    ["Millenium", "24141"],
    ["Magnum", "28200"],
    ["GoldenPlay", "24137"],
    ["Exclusive", "24144"],
    ["Eclipse", "25153"],
    ["Discovery", "27188"],
    ["Colúmbia", "29205"],
    ["Century", "24135"],
    ["Royal Play Plus", "27186"],
    ["Centro de Atividades", "99114"],
    ["Calypso", "25152"],
    ["Balanço Lado a Lado", "35357"],
    ["Balanço Criança", "99113"],
    ["Atlantis", "27183"],
    ["Aquarius Top", "29204-B"],
    ["Aquárius", "29204-A"],
    ["Apolo", "28198"],
    ["Antares (sem tubo, 18 cerquinhas opcionais)", "28201-B"],
    ["Torre do Castelo + Castelo Petit + Balanço", "35364"],
    ["Castelo Petit + Petit Play", "35360"],
  ].map(([nome, codigo]) => ({ nome, codigo })),
};

async function main() {
  let criados = 0;
  let pulados = 0;

  for (const [categoria, produtos] of Object.entries(CATALOGO)) {
    for (const { nome, codigo } of produtos) {
      const existente = await prisma.produto.findFirst({ where: { categoria, nome } });
      if (existente) {
        pulados++;
        continue;
      }
      await prisma.produto.create({ data: { categoria, nome, codigo } });
      criados++;
    }
  }

  console.log(`Produtos criados: ${criados}`);
  console.log(`Já existiam (pulados): ${pulados}`);
  await prisma.$disconnect();
}

main().catch(async (erro) => {
  console.error(erro);
  await prisma.$disconnect();
  process.exit(1);
});
