import "server-only";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { EMPRESA } from "@/lib/constants/empresa";
import { centavosParaReais } from "@/lib/utils/money";
import {
  LIMITE_PRODUTOS_PDF,
  NOME_ARQUIVO_PRODUTOS,
  nomeArquivoProduto,
} from "@/lib/utils/produto-envio";
import { carregarFotoProduto } from "@/lib/server/produto-cards";

// Ficha do produto em PDF pra mandar pelo WhatsApp (pedido do Marcos de
// 2026-10-14) — mesmo visual do PDF do orçamento (orcamento-pdf.tsx). Vários
// produtos selecionados viram um PDF só, um produto por página (2026-10-15).

const LOGO = fs.readFileSync(
  path.join(process.cwd(), "public", "legaus-logo.png"),
);

const cores = {
  teal: "#00A99D",
  tealEscuro: "#00655c",
  tealClaro: "#d9f2ef",
  cinza500: "#737373",
  cinza100: "#f5f5f5",
  texto: "#171717",
};

const styles = StyleSheet.create({
  page: {
    padding: 32,
    paddingBottom: 48,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: cores.texto,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: cores.teal,
    paddingBottom: 12,
  },
  logo: { width: 110, height: 48, objectFit: "contain" },
  empresaBloco: {
    alignItems: "flex-end",
    fontSize: 8,
    color: cores.cinza500,
    gap: 1.5,
  },
  empresaNome: { fontWeight: 700, color: cores.texto, fontSize: 9 },
  titulo: { fontSize: 20, fontWeight: 700, marginTop: 18 },
  subtitulo: { fontSize: 9, color: cores.cinza500, marginTop: 3 },
  fotoBox: {
    marginTop: 14,
    backgroundColor: cores.cinza100,
    borderRadius: 6,
    padding: 8,
    alignItems: "center",
  },
  foto: { width: "100%", height: 340, objectFit: "contain" },
  precoBox: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: cores.tealClaro,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  precoLabel: {
    fontSize: 9,
    color: cores.tealEscuro,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  precoValor: { fontSize: 18, fontWeight: 700, color: cores.tealEscuro },
  descricaoTitulo: {
    marginTop: 16,
    fontWeight: 700,
    fontSize: 10,
    marginBottom: 4,
  },
  descricao: { fontSize: 9.5, color: "#404040", lineHeight: 1.4 },
  rodape: {
    position: "absolute",
    left: 32,
    right: 32,
    bottom: 24,
    borderTopWidth: 1,
    borderTopColor: "#e5e5e5",
    paddingTop: 8,
    fontSize: 7.5,
    color: "#a3a3a3",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

type ProdutoPdfVM = {
  nome: string;
  codigo: string | null;
  categoria: string;
  descricao: string | null;
  valorCentavos: number | null;
  foto: Buffer | null;
};

function PaginaProduto({
  produto,
  ocultarValor,
  data,
}: {
  produto: ProdutoPdfVM;
  ocultarValor: boolean;
  data: string;
}) {
  const mostrarPreco = !ocultarValor && produto.valorCentavos != null;
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- Image aqui é do @react-pdf/renderer (destino é PDF), não HTML img */}
        <Image src={LOGO} style={styles.logo} />
        <View style={styles.empresaBloco}>
          <Text style={styles.empresaNome}>{EMPRESA.razaoSocial}</Text>
          <Text>CNPJ {EMPRESA.cnpj}</Text>
          <Text>
            {EMPRESA.endereco}, {EMPRESA.bairro} — {EMPRESA.cidade}/{EMPRESA.uf}
          </Text>
          <Text>
            {EMPRESA.telefone} · {EMPRESA.email}
          </Text>
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
          <Text style={styles.precoValor}>
            {centavosParaReais(produto.valorCentavos as number)}
          </Text>
        </View>
      )}

      {produto.descricao && (
        <View>
          <Text style={styles.descricaoTitulo}>Descrição</Text>
          <Text style={styles.descricao}>
            {produto.descricao.replace(/\n{3,}/g, "\n\n").trim()}
          </Text>
        </View>
      )}

      <View style={styles.rodape} fixed>
        <Text>
          {EMPRESA.nomeFantasia} — {EMPRESA.site}
        </Text>
        <Text
          render={({ pageNumber, totalPages }) =>
            totalPages > 1 ? `${data} · ${pageNumber}/${totalPages}` : data
          }
        />
      </View>
    </Page>
  );
}

// A foto vai como JPEG já carregado (upload ou URL do site antigo): o
// @react-pdf só lê JPG/PNG e não deve buscar URL por conta própria.
async function fotoParaPdf(produto: {
  imagemBytes: Uint8Array | null;
  imagemUrl: string | null;
}): Promise<Buffer | null> {
  const original = await carregarFotoProduto(produto);
  if (!original) return null;
  return sharp(original)
    .rotate()
    .resize({
      width: 1400,
      height: 1400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer()
    .catch(() => null);
}

/** Um PDF com os produtos na ordem pedida, um por página. */
export async function gerarPdfProdutos(
  produtoIds: string[],
  opcoes?: { ocultarValor?: boolean },
): Promise<{ buffer: Buffer; nomeArquivo: string }> {
  const ids = [...new Set(produtoIds)];
  if (ids.length === 0) throw new Error("Nenhum produto escolhido.");
  if (ids.length > LIMITE_PRODUTOS_PDF)
    throw new Error(`No máximo ${LIMITE_PRODUTOS_PDF} produtos por PDF.`);
  const encontrados = await prisma.produto.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      nome: true,
      codigo: true,
      categoria: true,
      descricao: true,
      valorCentavos: true,
      imagemBytes: true,
      imagemUrl: true,
    },
  });
  const porId = new Map(encontrados.map((p) => [p.id, p]));
  const produtos = ids
    .map((id) => porId.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  if (produtos.length === 0) throw new Error("Produto não encontrado.");

  const fotos = await Promise.all(produtos.map(fotoParaPdf));
  const data = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const ocultarValor = opcoes?.ocultarValor ?? false;

  const buffer = await renderToBuffer(
    <Document
      title={
        produtos.length === 1
          ? produtos[0].nome
          : `${EMPRESA.nomeFantasia} — ${produtos.length} produtos`
      }
    >
      {produtos.map((p, i) => (
        <PaginaProduto
          key={p.id}
          produto={{
            nome: p.nome,
            codigo: p.codigo,
            categoria: p.categoria,
            descricao: p.descricao,
            valorCentavos: p.valorCentavos,
            foto: fotos[i],
          }}
          ocultarValor={ocultarValor}
          data={data}
        />
      ))}
    </Document>,
  );
  return {
    buffer,
    nomeArquivo:
      produtos.length === 1
        ? nomeArquivoProduto(produtos[0].nome, "PDF")
        : NOME_ARQUIVO_PRODUTOS,
  };
}

export function gerarPdfProduto(
  produtoId: string,
  opcoes?: { ocultarValor?: boolean },
) {
  return gerarPdfProdutos([produtoId], opcoes);
}
