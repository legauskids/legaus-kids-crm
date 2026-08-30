import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { EMPRESA } from "@/lib/constants/empresa";

const LOGO = fs.readFileSync(path.join(process.cwd(), "public", "legaus-logo.png"));

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, fontFamily: "Helvetica", color: "#171717", lineHeight: 1.45 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: "#00A99D", paddingBottom: 12, marginBottom: 4 },
  logo: { width: 100, height: 44, objectFit: "contain" },
  empresaBloco: { alignItems: "flex-end", fontSize: 7.5, color: "#737373", gap: 1.5 },
  aviso: { marginTop: 8, marginBottom: 14, backgroundColor: "#fff4e5", borderWidth: 1, borderColor: "#f0c36d", borderRadius: 4, padding: 8, fontSize: 8, color: "#8a5a00" },
  titulo: { fontSize: 14, fontWeight: 700, textAlign: "center", marginTop: 4, marginBottom: 14, textTransform: "uppercase" },
  paragrafo: { marginBottom: 8, textAlign: "justify" },
  secaoTitulo: { fontWeight: 700, fontSize: 9.5, marginTop: 6, marginBottom: 2 },
  assinaturas: { marginTop: 32, flexDirection: "row", justifyContent: "space-between" },
  assinaturaBox: { width: "45%", alignItems: "center" },
  linhaAssinatura: { borderTopWidth: 1, borderTopColor: "#171717", width: "100%", marginBottom: 4, marginTop: 28 },
  assinaturaLabel: { fontSize: 8.5, textAlign: "center" },
  testemunhas: { marginTop: 28, flexDirection: "row", justifyContent: "space-between" },
  testemunhaBox: { width: "45%" },
  linhaTestemunha: { borderTopWidth: 1, borderTopColor: "#171717", width: "100%", marginBottom: 4, marginTop: 24 },
  testemunhaLabel: { fontSize: 8 },
  rodape: { marginTop: 24, borderTopWidth: 1, borderTopColor: "#e5e5e5", paddingTop: 8, fontSize: 7, color: "#a3a3a3", textAlign: "center" },
});

function formatarData(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(data);
}

// Bold só nos títulos de seção maiores ("1 - DOS TERMOS...", "Cláusula 1ª —
// ...") — os itens numerados menores ("1.1) Objeto:") ficam em texto normal,
// exatamente como no modelo real da Legaus Kids.
const REGEX_SECAO = /^(Cláusula|\d+\s*-\s*[A-ZÀ-Ú])/;

function ContratoPdfDocument({
  numero,
  titulo,
  paragrafos,
  contratanteNome,
  contratanteRepresentanteNome,
  contratanteRepresentanteCpf,
}: {
  numero: number;
  titulo: string;
  paragrafos: string[];
  contratanteNome: string;
  contratanteRepresentanteNome: string | null;
  contratanteRepresentanteCpf: string | null;
}) {
  const hoje = new Date();

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image aqui é do @react-pdf/renderer (destino é PDF), não HTML img */}
          <Image src={LOGO} style={styles.logo} />
          <View style={styles.empresaBloco}>
            <Text style={{ fontWeight: 700, color: "#171717", fontSize: 8.5 }}>{EMPRESA.razaoSocial}</Text>
            <Text>CNPJ {EMPRESA.cnpj}</Text>
            <Text>{EMPRESA.endereco}, {EMPRESA.bairro} — {EMPRESA.cidade}/{EMPRESA.uf}</Text>
          </View>
        </View>

        <Text style={styles.aviso}>
          Gerado automaticamente a partir do modelo cadastrado no CRM — confira os dados antes de enviar pra assinatura.
        </Text>

        <Text style={styles.titulo}>{titulo} nº {String(numero).padStart(4, "0")}</Text>

        {paragrafos.map((paragrafo, i) => (
          <Text key={i} style={REGEX_SECAO.test(paragrafo) ? styles.secaoTitulo : styles.paragrafo}>
            {paragrafo}
          </Text>
        ))}

        <View style={styles.assinaturas}>
          <View style={styles.assinaturaBox}>
            <View style={styles.linhaAssinatura} />
            <Text style={styles.assinaturaLabel}>
              {EMPRESA.razaoSocial}{"\n"}Representante: {EMPRESA.representanteNome}{"\n"}CPF nº {EMPRESA.representanteCpf}{"\n"}(VENDEDOR)
            </Text>
          </View>
          <View style={styles.assinaturaBox}>
            <View style={styles.linhaAssinatura} />
            <Text style={styles.assinaturaLabel}>
              {contratanteNome}
              {contratanteRepresentanteNome ? `\nRepresentante: ${contratanteRepresentanteNome}` : ""}
              {contratanteRepresentanteCpf ? `\nCPF nº ${contratanteRepresentanteCpf}` : ""}
              {"\n"}(COMPRADOR)
            </Text>
          </View>
        </View>

        <View style={styles.testemunhas}>
          <View style={styles.testemunhaBox}>
            <View style={styles.linhaTestemunha} />
            <Text style={styles.testemunhaLabel}>TESTEMUNHA 1{"\n"}Nome:{"\n"}CPF:</Text>
          </View>
          <View style={styles.testemunhaBox}>
            <View style={styles.linhaTestemunha} />
            <Text style={styles.testemunhaLabel}>TESTEMUNHA 2{"\n"}Nome:{"\n"}CPF:</Text>
          </View>
        </View>

        <View style={styles.rodape}>
          <Text>Documento gerado automaticamente pelo CRM da {EMPRESA.nomeFantasia} em {formatarData(hoje)}.</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function gerarPdfContrato(contratoId: string): Promise<{ buffer: Buffer; nomeArquivo: string }> {
  const contrato = await prisma.contrato.findUnique({
    where: { id: contratoId },
    include: { negocio: { include: { contato: true } } },
  });
  if (!contrato) throw new Error("Contrato não encontrado.");

  // Um parágrafo por linha em branco no texto salvo — o primeiro vira o
  // título do documento, o resto é o corpo (seções "1 - ..." ganham destaque).
  const [tituloBruto, ...paragrafos] = contrato.conteudo
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const titulo = tituloBruto || "Contrato";
  const contratanteNome = contrato.negocio.contato?.razaoSocial || contrato.negocio.contato?.nome || "Cliente";

  const buffer = await renderToBuffer(
    <ContratoPdfDocument
      numero={contrato.numero}
      titulo={titulo}
      paragrafos={paragrafos}
      contratanteNome={contratanteNome}
      contratanteRepresentanteNome={contrato.negocio.contato?.representanteLegalNome ?? null}
      contratanteRepresentanteCpf={contrato.negocio.contato?.representanteLegalCpf ?? null}
    />,
  );

  return { buffer, nomeArquivo: `contrato-${String(contrato.numero).padStart(4, "0")}.pdf` };
}
