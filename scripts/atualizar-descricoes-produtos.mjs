// Preenche Produto.descricao com o texto real do site (legauskids.com.br),
// puxado ao vivo da página de cada produto (bloco
// <div class="product-short-description">). Pareamento por código (SKU) do
// produto quando existe, com fallback por nome normalizado. Nunca sobrescreve
// uma descrição que já esteja preenchida (edição manual tem prioridade).
//
// Rodar: node scripts/atualizar-descricoes-produtos.mjs

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// Academia Aberta não tem página própria de produto no site (é uma lista
// simples com nome + foto, sem texto de descrição) — não tem o que puxar.
// Pedagógicos é uma categoria nova, criada aqui no CRM, sem equivalente no site.
const CATEGORIAS_SITE = {
  Playground: "playground",
  "Parque Infantil": "parque-infantil",
  Kidplay: "kidplay",
  Pisos: "pisos",
  "Mobiliário": "mobiliario",
  "Outros Produtos": "outros-produtos",
  "Parque Infantil Baby": "parque-infantil-baby",
  "Parque Infantil PNE": "parque-infantil-pne",
  "Linha Rotomoldados": "linha-rotomoldado",
};

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizar(texto) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function decodificarEntidades(html) {
  return html
    .replace(/&aacute;/g, "á")
    .replace(/&Aacute;/g, "Á")
    .replace(/&eacute;/g, "é")
    .replace(/&Eacute;/g, "É")
    .replace(/&iacute;/g, "í")
    .replace(/&Iacute;/g, "Í")
    .replace(/&oacute;/g, "ó")
    .replace(/&Oacute;/g, "Ó")
    .replace(/&uacute;/g, "ú")
    .replace(/&Uacute;/g, "Ú")
    .replace(/&atilde;/g, "ã")
    .replace(/&Atilde;/g, "Ã")
    .replace(/&otilde;/g, "õ")
    .replace(/&Otilde;/g, "Õ")
    .replace(/&ccedil;/g, "ç")
    .replace(/&Ccedil;/g, "Ç")
    .replace(/&ecirc;/g, "ê")
    .replace(/&Ecirc;/g, "Ê")
    .replace(/&acirc;/g, "â")
    .replace(/&Acirc;/g, "Â")
    .replace(/&ocirc;/g, "ô")
    .replace(/&Ocirc;/g, "Ô")
    .replace(/&agrave;/g, "à")
    .replace(/&#8211;|&#8212;/g, "-")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8216;|&#8217;/g, "'")
    .replace(/&ordm;/g, "º")
    .replace(/&ordf;/g, "ª")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, cod) => String.fromCharCode(Number(cod)));
}

function htmlParaTexto(bloco) {
  let t = bloco;
  t = t.replace(/<li[^>]*>/gi, "\n- ").replace(/<\/li>/gi, "");
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<\/p>/gi, "\n\n").replace(/<p[^>]*>/gi, "");
  t = t.replace(/<\/?(ul|div|section|span)[^>]*>/gi, "\n");
  t = t.replace(/<[^>]+>/g, "");
  t = decodificarEntidades(t);
  t = t.replace(/[ \t]+/g, " ");
  t = t.replace(/\n[ \t]+/g, "\n");
  t = t.replace(/[ \t]+\n/g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

async function buscarPagina(url) {
  try {
    const resposta = await fetch(url, { headers: { "User-Agent": UA } });
    if (!resposta.ok) return null;
    return await resposta.text();
  } catch {
    return null;
  }
}

async function listarProdutosDaCategoria(slug) {
  const itens = [];
  for (let pagina = 1; pagina <= 10; pagina++) {
    const url =
      pagina === 1
        ? `https://www.legauskids.com.br/categoria-produtos/${slug}/`
        : `https://www.legauskids.com.br/categoria-produtos/${slug}/page/${pagina}/`;
    const html = await buscarPagina(url);
    if (!html) break;
    const regex = /class="name product-title"><a href="([^"]+)">([^<]*)<\/a>/g;
    let encontrados = 0;
    for (let m = regex.exec(html); m; m = regex.exec(html)) {
      itens.push({ url: m[1], nome: decodificarEntidades(m[2]) });
      encontrados++;
    }
    if (encontrados === 0) break;
    await esperar(200);
  }
  const vistos = new Set();
  return itens.filter((it) => (vistos.has(it.url) ? false : (vistos.add(it.url), true)));
}

async function extrairDescricaoDaPagina(url) {
  const html = await buscarPagina(url);
  if (!html) return null;
  const skuMatch = html.match(/class="sku">([^<]+)<\/span>/);
  const sku = skuMatch ? skuMatch[1].trim() : null;

  const marcador = '<div class="product-short-description">';
  const inicio = html.indexOf(marcador);
  if (inicio === -1) return { sku, descricao: null };
  const aposAbertura = inicio + marcador.length;
  const fechamento = html.indexOf("</div>", aposAbertura);
  if (fechamento === -1) return { sku, descricao: null };
  const bloco = html.slice(aposAbertura, fechamento);
  const descricao = htmlParaTexto(bloco);
  return { sku, descricao: descricao || null };
}

async function main() {
  let atualizados = 0;
  let jaTinhaDescricao = 0;
  const semCorrespondencia = [];
  const semDescricaoNoSite = [];

  for (const [categoria, slug] of Object.entries(CATEGORIAS_SITE)) {
    console.log(`\n== ${categoria} ==`);
    const produtos = await prisma.produto.findMany({ where: { categoria }, orderBy: { createdAt: "asc" } });
    const itensSite = await listarProdutosDaCategoria(slug);
    console.log(`  ${produtos.length} produtos no banco, ${itensSite.length} produtos encontrados no site`);

    const cache = new Map();
    async function obterDescricao(url) {
      if (cache.has(url)) return cache.get(url);
      const r = await extrairDescricaoDaPagina(url);
      cache.set(url, r);
      await esperar(250);
      return r;
    }

    for (const produto of produtos) {
      if (produto.descricao) {
        jaTinhaDescricao++;
        continue;
      }

      let item = null;
      if (produto.codigo) {
        const codigoNorm = normalizar(produto.codigo);
        item = itensSite.find((it) => normalizar(it.nome).includes(codigoNorm));
      }
      if (!item) {
        const nomeNorm = normalizar(produto.nome);
        item = itensSite.find((it) => normalizar(it.nome) === nomeNorm);
      }
      if (!item) {
        semCorrespondencia.push(`${categoria} / ${produto.codigo ?? "-"} / ${produto.nome}`);
        continue;
      }

      const dados = await obterDescricao(item.url);
      if (!dados || !dados.descricao) {
        semDescricaoNoSite.push(`${categoria} / ${produto.nome} (${item.url})`);
        continue;
      }

      await prisma.produto.update({ where: { id: produto.id }, data: { descricao: dados.descricao } });
      atualizados++;
      console.log(`  OK: ${produto.nome}`);
    }
  }

  console.log(`\n=== Resumo ===`);
  console.log(`Atualizados agora: ${atualizados}`);
  console.log(`Já tinham descrição (não mexido): ${jaTinhaDescricao}`);
  console.log(`Sem correspondência no site (${semCorrespondencia.length}):`);
  semCorrespondencia.forEach((l) => console.log("  - " + l));
  console.log(`Sem texto de descrição na página do produto (${semDescricaoNoSite.length}):`);
  semDescricaoNoSite.forEach((l) => console.log("  - " + l));

  await prisma.$disconnect();
}

main().catch(async (erro) => {
  console.error(erro);
  await prisma.$disconnect();
  process.exit(1);
});
