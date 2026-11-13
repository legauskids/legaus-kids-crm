import "server-only";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IBorderOptions,
} from "docx";
import { carregarDocumentoContrato, type DocumentoContrato } from "@/lib/server/contrato-documento";
import { nomeProprio } from "@/lib/utils/contrato";

// O mesmo contrato do PDF em Word (.docx), pra quem quiser mexer no texto fora
// do CRM. Tamanhos em meio-ponto (22 = 11 pt) e margens em twips (567 = 1 cm).

const LOGO = fs.readFileSync(path.join(process.cwd(), "public", "legaus-logo.png"));
let logoPequeno: Promise<Buffer> | null = null;
// O logo original tem 2203 px — uma cópia pequena basta pro cabeçalho.
const logoDoWord = () => (logoPequeno ??= sharp(LOGO).resize(360).png().toBuffer());

const SEM_BORDA: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const SEM_BORDAS = { top: SEM_BORDA, bottom: SEM_BORDA, left: SEM_BORDA, right: SEM_BORDA };
const TABELA_SEM_BORDAS = { ...SEM_BORDAS, insideHorizontal: SEM_BORDA, insideVertical: SEM_BORDA };
const LINHA_ASSINATURA: IBorderOptions = { style: BorderStyle.SINGLE, size: 6, color: "171717", space: 4 };

/** Quebra de linha dentro do parágrafo vira quebra de linha no Word. */
function linhas(texto: string, estilo: { bold?: boolean; size?: number; color?: string } = {}): TextRun[] {
  return texto.split("\n").map((linha, i) => new TextRun({ text: linha, break: i > 0 ? 1 : undefined, ...estilo }));
}

function colunas(esquerda: Paragraph[], direita: Paragraph[]): Table {
  const celula = (children: Paragraph[]) => new TableCell({ children, borders: SEM_BORDAS, width: { size: 50, type: WidthType.PERCENTAGE } });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABELA_SEM_BORDAS,
    rows: [new TableRow({ children: [celula(esquerda), celula(direita)] })],
  });
}

async function cabecalho(doc: DocumentoContrato): Promise<Table> {
  const { empresa } = doc;
  const marca =
    doc.empresaEmissora === "LEGAUS"
      ? new Paragraph({ children: [new ImageRun({ type: "png", data: await logoDoWord(), transformation: { width: 110, height: 70 } })] })
      : new Paragraph({ children: [new TextRun({ text: empresa.nomeFantasia, bold: true, size: 28 })] });
  const dados = [
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: nomeProprio(empresa.razaoSocial), bold: true, size: 17 })] }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `CNPJ ${empresa.cnpj}`, size: 15, color: "737373" })] }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: `${empresa.endereco}, ${empresa.bairro} — ${empresa.cidade}/${empresa.uf}`, size: 15, color: "737373" })],
    }),
  ];
  return colunas([marca], dados);
}

function assinaturas(doc: DocumentoContrato): Table[] {
  const assinatura = (texto: string[], papel: string) => [
    new Paragraph({ alignment: AlignmentType.CENTER, border: { top: LINHA_ASSINATURA }, children: linhas([...texto, `(${papel})`].join("\n"), { size: 19 }) }),
  ];
  const testemunha = (n: number) => [new Paragraph({ border: { top: LINHA_ASSINATURA }, children: linhas(`Testemunha ${n}\nNome:\nCPF:`, { size: 19 }) })];
  return [colunas(assinatura(doc.vendedor, "Vendedor"), assinatura(doc.comprador, "Comprador")), colunas(testemunha(1), testemunha(2))];
}

export async function gerarWordContrato(contratoId: string): Promise<{ buffer: Buffer; nomeArquivo: string }> {
  const doc = await carregarDocumentoContrato(contratoId);

  const corpo: (Paragraph | Table)[] = [
    await cabecalho(doc),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 16, color: "00A99D", space: 1 } }, spacing: { after: 360 }, children: [] }),
  ];
  if (doc.rascunho) {
    corpo.push(
      new Paragraph({
        shading: { type: ShadingType.CLEAR, fill: "FFF4E5", color: "auto" },
        spacing: { after: 280 },
        children: [new TextRun({ text: "Rascunho — confira os dados e o texto antes de mandar pra assinatura.", size: 18, color: "8A5A00" })],
      }),
    );
  }
  corpo.push(
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: linhas(doc.titulo, { bold: true, size: 26 }) }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 320 }, children: [new TextRun({ text: `Contrato nº ${doc.numero}`, size: 18, color: "737373" })] }),
    ...doc.blocos.map((bloco, i) =>
      bloco.tipo === "secao"
        ? new Paragraph({ spacing: { before: 120, after: 120 }, keepNext: true, children: linhas(bloco.texto, { bold: true }) })
        : // O fecho (data) fica na mesma folha das assinaturas.
          new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 160 }, keepNext: i === doc.blocos.length - 1, children: linhas(bloco.texto) }),
    ),
    new Paragraph({ spacing: { before: 600 }, keepNext: true, children: [] }),
    ...assinaturas(doc).flatMap((tabela, i) => (i === 0 ? [tabela] : [new Paragraph({ spacing: { before: 720 }, keepNext: true, children: [] }), tabela])),
  );

  const documento = new Document({
    creator: "CRM Legaus Kids",
    title: `Contrato nº ${doc.numero}`,
    styles: { default: { document: { run: { font: "Arial", size: 22 }, paragraph: { spacing: { line: 312 } } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1100, left: 1100, right: 1100 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: [`${doc.rascunho ? "Rascunho do contrato" : "Contrato"} nº ${doc.numero} · página `, PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES],
                    size: 16,
                    color: "A3A3A3",
                  }),
                ],
              }),
            ],
          }),
        },
        children: corpo,
      },
    ],
  });

  return { buffer: await Packer.toBuffer(documento), nomeArquivo: `${doc.nomeArquivo}${doc.rascunho ? "-rascunho" : ""}.docx` };
}
