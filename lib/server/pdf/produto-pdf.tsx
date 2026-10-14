import "server-only";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { EMPRESA } from "@/lib/constants/empresa";
import { centavosParaReais } from "@/lib/utils/money";
import { nomeArquivoProduto } from "@/lib/utils/produto-envio";
import { carregarFotoProduto } from "@/lib/server/produto-cards";

// Ficha do produto em PDF pra mandar pelo WhatsApp (pedido do Marcos de
// 2026-10-14) — mesmo visual do PDF do orçamento (orcamento-pdf.tsx).

const LOGO = fs.readFileSync(path.join(process.cwd(), "public", "legaus-logo.png"));

const cores = { teal: "#00A99D", tealEscuro: "#00655c", tealClaro: "#d9f2ef", cinza500: "#737373", cinza100: "#f5f5f5", texto: "#171717" };

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: cores.texto },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: cores.teal, paddingBottom: 12 },
  logo: { width: 110, height: 48, objectFit: "contain" },
  empresaBloco: { alignItems: "flex-end", fontSize: 8, color: cores.cinza500, gap: 1.5 },
  empresaNome: { fontWeight: 700, color: cores.texto, fontSize: 9 },
  titulo: { fontSize: 20, fontWeight: 700, marginTop: 18 },
  subtitulo: { fontSize: 9, color: cores.cinza500, marginTop: 3 },
  fotoBox: { marginTop: 14, backgroundColor: cores.cinza100, borderRadius: 6, padding: 8, alignItems: "center" },
  foto: { width: "100%", height: 340, objectFit: "contain" },
  precoBox: { marginTop: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: cores.tealClaro, borderRadius: 6, paddingVertical: 10, paddingHorizontal: 14 },
  precoLabel: { fontSize: 9, color: cores.tealEscuro, textTransform: "uppercase", letterSpacing: 0.5 },
  precoValor: { fontSize: 18, fontWeight: 700, color: cores.tealEscuro },
  descricaoTitulo: { marginTop: 16, fontWeight: 700, fontSize: 10, marginBottom: 4 },
  descricao: { fontSize: 9.5, color: "#404040", lineHeight: 1.4 },
  rodape: { position: "absolute", left: 32, right: 32, bottom: 24, borderTopWidth: 1, borderTopColor: "#e5e5e5", paddingTop: 8, fontSize: 7.5, color: "#a3a3a3", flexDirection: "row", justifyContent: "space-between" },
});

type ProdutoPdfVM = {
  nome: string;
  codigo: string | null;
  categoria: string;
  descricao: string | null;
  valorCentavos: number | null;
  foto: Buffer | null;
  ocultarValor: boolean;
};

function ProdutoPdfDocument({ produto }: { produto: ProdutoPdfVM }) {
  const mostrarPreco = !produto.ocultarValor && produto.valorCentavos != null;
  return (
    <Document title={produto.nome}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image aqui é do @react-pdf/renderer (destino é PDF), não HTML img */}
          <Image src={LOGO} style={styles.logo} />
          <View style={styles.empresaBloco}>
            <Text style={styles.empresaNome}>{EMPRESA.razaoSocial}</Text>
            <Text>CNPJ {EMPRESA.cnpj}</Text>
            <Text>{EMPRESA.endereco}, {EMPRESA.bairro} — {EMPRESA.cidade}/{EMPRESA.uf}</Text>
            <Text>{EMPRESA.telefone} · {EMPRESA.email}</Text>
          </View>
        </View>

        <Text style={styles.titulo}>{produto.nome}</Text>
        <Text style={styles.subtitulo}>
          {produto.categoria}
          {produto.codigo ? ` · Código ${produto.codigo}` : ""}
        </Text>

        {produto.foto && (
          <View style={styles.fotoBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- Image aqui é do @react-pdf/renderer (destino é PDF), não HTML img */}
            <Image src={produto.foto} style={styles.foto} />
          </View>
        )}

        {mostrarPreco && (
          <View style={styles.precoBox}>
            <Text style={styles.precoLabel}>Valor</Text>
            <Text style={styles.precoValor}>{centavosParaReais(produto.valorCentavos as number)}</Text>
          </View>
        )}

        {produto.descricao && (
          <View>
            <Text style={styles.descricaoTitulo}>Descrição</Text>
            <Text style={styles.descricao}>{produto.descricao.replace(/\n{3,}/g, "\n\n").trim()}</Text>
          </View>
        )}

        <View style={styles.rodape} fixed>
          <Text>
            {EMPRESA.nomeFantasia} — {EMPRESA.site}
          </Text>
          <Text>{new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date())}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function gerarPdfProduto(produtoId: string, opcoes?: { ocultarValor?: boolean }): Promise<{ buffer: Buffer; nomeArquivo: string }> {
  const produto = await prisma.produto.findUnique({
    where: { id: produtoId },
    select: { nome: true, codigo: true, categoria: true, descricao: true, valorCentavos: true, imagemBytes: true, imagemUrl: true },
  });
  if (!produto) throw new Error("Produto não encontrado.");

  // A foto vai como JPEG já carregado (upload ou URL do site antigo): o
  // @react-pdf só lê JPG/PNG e não deve buscar URL por conta própria.
  const original = await carregarFotoProduto(produto);
  const foto = original
    ? await sharp(original)
        .rotate()
        .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer()
        .catch(() => null)
    : null;

  const buffer = await renderToBuffer(
    <ProdutoPdfDocument
      produto={{
        nome: produto.nome,
        codigo: produto.codigo,
        categoria: produto.categoria,
        descricao: produto.descricao,
        valorCentavos: produto.valorCentavos,
        foto,
        ocultarValor: opcoes?.ocultarValor ?? false,
      }}
    />,
  );
  return { buffer, nomeArquivo: nomeArquivoProduto(produto.nome, "PDF") };
}
