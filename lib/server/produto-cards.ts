import "server-only";
import path from "node:path";
import sharp from "sharp";
import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { centavosParaReais } from "@/lib/utils/money";

const LOGO_PATH = path.join(process.cwd(), "public", "legaus-logo.png");
const COR_MARCA = "#00A99D";
const COR_MARCA_ESCURA = "#00786f";
const LARGURA = 1080;
// Altura da área da foto acompanha a proporção da foto (sem recortar o
// produto): de 16:9 (paisagem) até quadrada. O card inteiro vai no máximo
// até 4:5 (1080x1350), que o WhatsApp mostra sem cortar.
const ALTURA_FOTO_MIN = 608;
const ALTURA_FOTO_MAX = 1080;
const ALTURA_FOTO_SEM_FOTO = 780;
const ALTURA_CARD_MAX = 1350;
const ALTURA_INFO_MIN = 240;

/** Foto do produto pode vir de upload (imagemBytes) ou de URL externa (site antigo) — trata os dois casos. */
async function carregarFotoProduto(produto: { imagemBytes: Uint8Array | null; imagemUrl: string | null }): Promise<Buffer | null> {
  if (produto.imagemBytes) return Buffer.from(produto.imagemBytes);
  if (produto.imagemUrl) {
    try {
      const resposta = await fetch(produto.imagemUrl);
      if (!resposta.ok) return null;
      return Buffer.from(await resposta.arrayBuffer());
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Altura da faixa de informações (nome, descrição, logo e preço) — estimada
 * pelo tamanho dos textos, porque o card tem altura fixa na renderização e
 * texto que não cabe ficava cortado. Folgada de propósito: sobra vira respiro.
 */
function estimarAlturaInfo(nome: string, descricao: string | null): number {
  const linhasNome = Math.min(3, Math.max(1, Math.ceil(nome.length / 42)));
  const linhasDescricao = descricao ? Math.min(3, Math.ceil(descricao.length / 70)) : 0;
  const altura = 68 /* padding */ + linhasNome * 54 + (linhasDescricao ? 12 + linhasDescricao * 37 : 0) + 12 + 64 /* rodapé */ + 24;
  return Math.max(ALTURA_INFO_MIN, altura);
}

/**
 * Foto inteira (nunca recortada) centralizada na área, com a própria foto
 * desfocada preenchendo a sobra — antes era "cover", e foto vertical (de
 * celular) perdia metade de cima/baixo, justamente onde estava o produto.
 */
async function montarAreaFoto(foto: Buffer, altura: number): Promise<Buffer> {
  const normal = await sharp(foto).rotate().toBuffer();
  // Desfoque barato: reduz bastante e amplia de volta. Em duas pipelines de
  // propósito — o sharp só aplica UM resize por pipeline (o último vence).
  const miniatura = await sharp(normal)
    .resize(Math.round(LARGURA / 16), Math.round(altura / 16), { fit: "cover" })
    .toBuffer();
  const [fundo, frente] = await Promise.all([
    sharp(miniatura).resize(LARGURA, altura, { kernel: "cubic" }).blur(12).toBuffer(),
    sharp(normal).resize(LARGURA, altura, { fit: "inside" }).toBuffer(),
  ]);
  return sharp(fundo).composite([{ input: frente, gravity: "center" }]).jpeg({ quality: 90 }).toBuffer();
}

/**
 * Card de produto pronto pra mandar pro WhatsApp de um cliente: foto em
 * destaque, nome, descrição resumida e preço, com a marca Legaus Kids no
 * rodapé. Renderizado sob demanda (não fica salvo em disco/banco) — assim
 * preço e descrição sempre refletem o cadastro atual, sem precisar
 * regenerar quando o produto muda.
 */
export async function gerarCardProdutoBuffer(produtoId: string, opcoes?: { ocultarValor?: boolean }): Promise<Buffer> {
  const produto = await prisma.produto.findUniqueOrThrow({
    where: { id: produtoId },
    select: { nome: true, descricao: true, valorCentavos: true, imagemUrl: true, imagemBytes: true },
  });

  const [fotoOriginal, logoBuffer] = await Promise.all([
    carregarFotoProduto(produto),
    sharp(LOGO_PATH).resize({ width: 200 }).png().toBuffer(),
  ]);

  const precoTexto = produto.valorCentavos != null ? centavosParaReais(produto.valorCentavos) : "Consulte";
  const descricaoResumida = produto.descricao
    ? produto.descricao.length > 130
      ? `${produto.descricao.slice(0, 130).trim()}…`
      : produto.descricao
    : null;

  const alturaInfo = estimarAlturaInfo(produto.nome, descricaoResumida);
  let alturaFoto = ALTURA_FOTO_SEM_FOTO;
  if (fotoOriginal) {
    const meta = await sharp(fotoOriginal).rotate().metadata();
    const largura = meta.autoOrient?.width ?? meta.width ?? LARGURA;
    const altura = meta.autoOrient?.height ?? meta.height ?? ALTURA_FOTO_SEM_FOTO;
    const alturaNatural = Math.round(LARGURA / (largura / altura));
    alturaFoto = Math.min(Math.max(alturaNatural, ALTURA_FOTO_MIN), ALTURA_FOTO_MAX, ALTURA_CARD_MAX - alturaInfo);
  }
  const alturaCard = alturaFoto + alturaInfo;

  const fotoMontada = fotoOriginal ? await montarAreaFoto(fotoOriginal, alturaFoto) : null;
  const fotoDataUri = fotoMontada ? `data:image/jpeg;base64,${fotoMontada.toString("base64")}` : null;
  const logoDataUri = `data:image/png;base64,${logoBuffer.toString("base64")}`;

  const resposta = new ImageResponse(
    {
      type: "div",
      key: null,
      props: {
        style: {
          width: LARGURA,
          height: alturaCard,
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          fontFamily: "Arial",
        },
        children: [
          fotoDataUri
            ? {
                type: "img",
                key: "foto",
                props: { src: fotoDataUri, style: { width: LARGURA, height: alturaFoto } },
              }
            : {
                type: "div",
                key: "placeholder",
                props: {
                  style: {
                    width: LARGURA,
                    height: alturaFoto,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: `linear-gradient(135deg, ${COR_MARCA_ESCURA}, ${COR_MARCA})`,
                  },
                  children: { type: "img", key: "logo-placeholder", props: { src: logoDataUri, style: { width: 320 } } },
                },
              },
          {
            type: "div",
            key: "info",
            props: {
              style: {
                height: alturaInfo,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                padding: "34px 44px",
                gap: "12px",
              },
              children: [
                {
                  type: "div",
                  key: "nome",
                  props: { style: { display: "flex", fontSize: 46, fontWeight: 800, color: "#1a1a1a", lineHeight: 1.15 }, children: produto.nome },
                },
                descricaoResumida
                  ? {
                      type: "div",
                      key: "desc",
                      props: { style: { display: "flex", fontSize: 27, color: "#5a5a5a", lineHeight: 1.35 }, children: descricaoResumida },
                    }
                  : null,
                {
                  type: "div",
                  key: "rodape",
                  props: {
                    style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" },
                    children: [
                      { type: "img", key: "logo", props: { src: logoDataUri, style: { height: 58 } } },
                      opcoes?.ocultarValor
                        ? null
                        : { type: "div", key: "preco", props: { style: { display: "flex", fontSize: 42, fontWeight: 800, color: COR_MARCA_ESCURA }, children: precoTexto } },
                    ].filter(Boolean),
                  },
                },
              ].filter(Boolean),
            },
          },
        ],
      },
    } as ConstructorParameters<typeof ImageResponse>[0],
    { width: LARGURA, height: alturaCard },
  );

  const png = Buffer.from(await resposta.arrayBuffer());
  return sharp(png).jpeg({ quality: 90 }).toBuffer();
}
