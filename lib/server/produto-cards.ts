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
const ALTURA_FOTO = 780;
const ALTURA = 1080;

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
 * Card de produto pronto pra mandar pro WhatsApp de um cliente: foto em
 * destaque, nome, descrição resumida e preço, com a marca Legaus Kids no
 * rodapé. Renderizado sob demanda (não fica salvo em disco/banco) — assim
 * preço e descrição sempre refletem o cadastro atual, sem precisar
 * regenerar quando o produto muda.
 */
export async function gerarCardProdutoBuffer(produtoId: string): Promise<Buffer> {
  const produto = await prisma.produto.findUniqueOrThrow({
    where: { id: produtoId },
    select: { nome: true, descricao: true, valorCentavos: true, imagemUrl: true, imagemBytes: true },
  });

  const [fotoOriginal, logoBuffer] = await Promise.all([
    carregarFotoProduto(produto),
    sharp(LOGO_PATH).resize({ width: 200 }).png().toBuffer(),
  ]);

  const fotoRecortada = fotoOriginal
    ? await sharp(fotoOriginal).rotate().resize(LARGURA, ALTURA_FOTO, { fit: "cover", position: "attention" }).jpeg({ quality: 90 }).toBuffer()
    : null;

  const fotoDataUri = fotoRecortada ? `data:image/jpeg;base64,${fotoRecortada.toString("base64")}` : null;
  const logoDataUri = `data:image/png;base64,${logoBuffer.toString("base64")}`;
  const precoTexto = produto.valorCentavos != null ? centavosParaReais(produto.valorCentavos) : "Consulte";
  const descricaoResumida = produto.descricao
    ? produto.descricao.length > 130
      ? `${produto.descricao.slice(0, 130).trim()}…`
      : produto.descricao
    : null;

  const resposta = new ImageResponse(
    {
      type: "div",
      key: null,
      props: {
        style: {
          width: LARGURA,
          height: ALTURA,
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
                props: { src: fotoDataUri, style: { width: LARGURA, height: ALTURA_FOTO, objectFit: "cover" as const } },
              }
            : {
                type: "div",
                key: "placeholder",
                props: {
                  style: {
                    width: LARGURA,
                    height: ALTURA_FOTO,
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
                flex: 1,
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
                      { type: "div", key: "preco", props: { style: { display: "flex", fontSize: 42, fontWeight: 800, color: COR_MARCA_ESCURA }, children: precoTexto } },
                    ],
                  },
                },
              ].filter(Boolean),
            },
          },
        ],
      },
    } as ConstructorParameters<typeof ImageResponse>[0],
    { width: LARGURA, height: ALTURA },
  );

  const png = Buffer.from(await resposta.arrayBuffer());
  return sharp(png).jpeg({ quality: 90 }).toBuffer();
}
