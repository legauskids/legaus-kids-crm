import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { carregarDocumentoContrato, type DocumentoContrato } from "@/lib/server/contrato-documento";
import { nomeProprio } from "@/lib/utils/contrato";

const LOGO = fs.readFileSync(path.join(process.cwd(), "public", "legaus-logo.png"));

// A divisão de sílabas padrão do react-pdf é a do inglês ("DORA-VANTE",
// "REPRE-SENTADA") — no contrato em português a palavra não é quebrada.
const semHifenizar = (palavra: string) => [palavra];

const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 60, paddingHorizontal: 54, fontSize: 11, fontFamily: "Helvetica", color: "#171717", lineHeight: 1.5 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: "#00A99D", paddingBottom: 12, marginBottom: 18 },
  logo: { width: 100, height: 44, objectFit: "contain" },
  empresaBloco: { alignItems: "flex-end", fontSize: 7.5, color: "#737373", gap: 1.5, lineHeight: 1.3 },
  aviso: { marginBottom: 16, backgroundColor: "#fff4e5", borderWidth: 1, borderColor: "#f0c36d", borderRadius: 4, padding: 8, fontSize: 9, color: "#8a5a00", lineHeight: 1.35 },
  marcaDagua: { position: "absolute", top: 380, left: 0, right: 0, textAlign: "center", fontSize: 96, fontWeight: 700, color: "#d97706", opacity: 0.08, transform: "rotate(-32deg)" },
  titulo: { fontSize: 13, fontWeight: 700, textAlign: "center", marginBottom: 2 },
  numero: { fontSize: 9, color: "#737373", textAlign: "center", marginBottom: 16 },
  paragrafo: { marginBottom: 8, textAlign: "justify" },
  secaoTitulo: { fontWeight: 700, marginTop: 6, marginBottom: 6 },
  assinaturas: { marginTop: 36, flexDirection: "row", justifyContent: "space-between" },
  assinaturaBox: { width: "45%", alignItems: "center" },
  linhaAssinatura: { borderTopWidth: 1, borderTopColor: "#171717", width: "100%", marginBottom: 4 },
  assinaturaLabel: { fontSize: 9.5, textAlign: "center", lineHeight: 1.35 },
  testemunhas: { marginTop: 44, flexDirection: "row", justifyContent: "space-between" },
  testemunhaBox: { width: "45%" },
  testemunhaLabel: { fontSize: 9.5, lineHeight: 1.6 },
  // Com "bottom" o react-pdf jogava o rodapé pra fora da folha (y ≈ 8000); "top" fica certo.
  rodape: { position: "absolute", top: 806, left: 54, right: 54, fontSize: 8, lineHeight: 1, color: "#a3a3a3", textAlign: "center" },
});

function ContratoPdfDocument({ doc }: { doc: DocumentoContrato }) {
  const { empresa } = doc;
  // O fecho ("Santa Rosa/RS, 12 de novembro de 2026.") vai junto das
  // assinaturas, pra elas nunca ficarem sozinhas numa folha sem texto.
  const ultimo = doc.blocos.at(-1);
  const fecho = ultimo?.tipo === "paragrafo" && ultimo.texto.length <= 600 ? ultimo : null;
  const corpo = fecho ? doc.blocos.slice(0, -1) : doc.blocos;
  return (
    <Document title={`Contrato nº ${doc.numero}`}>
      <Page size="A4" style={styles.page}>
        {doc.rascunho && (
          <Text fixed style={styles.marcaDagua}>
            Rascunho
          </Text>
        )}

        <View style={styles.header}>
          {/* Logo só existe da Legaus Kids — contrato da Idezza mostra só o
              nome fantasia em texto até termos uma logo dela também. */}
          {doc.empresaEmissora === "LEGAUS" ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- Image aqui é do @react-pdf/renderer (destino é PDF), não HTML img
            <Image src={LOGO} style={styles.logo} />
          ) : (
            <Text style={{ fontWeight: 700, fontSize: 14 }}>{empresa.nomeFantasia}</Text>
          )}
          <View style={styles.empresaBloco}>
            <Text style={{ fontWeight: 700, color: "#171717", fontSize: 8.5 }}>{nomeProprio(empresa.razaoSocial)}</Text>
            <Text>CNPJ {empresa.cnpj}</Text>
            <Text>
              {empresa.endereco}, {empresa.bairro} — {empresa.cidade}/{empresa.uf}
            </Text>
          </View>
        </View>

        {doc.rascunho && (
          <Text style={styles.aviso} hyphenationCallback={semHifenizar}>
            Rascunho — confira os dados e o texto no CRM e clique em Finalizar antes de mandar pra assinatura.
          </Text>
        )}

        <Text style={styles.titulo} hyphenationCallback={semHifenizar}>
          {doc.titulo}
        </Text>
        <Text style={styles.numero}>Contrato nº {doc.numero}</Text>

        {corpo.map((bloco, i) => (
          <Text key={i} style={bloco.tipo === "secao" ? styles.secaoTitulo : styles.paragrafo} hyphenationCallback={semHifenizar}>
            {bloco.texto}
          </Text>
        ))}

        {/* Fecho, assinaturas e testemunhas juntos, sem partir entre duas folhas. */}
        <View wrap={false}>
          {fecho && (
            <Text style={styles.paragrafo} hyphenationCallback={semHifenizar}>
              {fecho.texto}
            </Text>
          )}
          <View style={styles.assinaturas}>
            {[
              { linhas: doc.vendedor, papel: "Vendedor" },
              { linhas: doc.comprador, papel: "Comprador" },
            ].map(({ linhas, papel }) => (
              <View key={papel} style={styles.assinaturaBox}>
                <View style={styles.linhaAssinatura} />
                <Text style={styles.assinaturaLabel}>
                  {linhas.join("\n")}
                  {"\n"}({papel})
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.testemunhas}>
            {[1, 2].map((n) => (
              <View key={n} style={styles.testemunhaBox}>
                <View style={styles.linhaAssinatura} />
                <Text style={styles.testemunhaLabel}>Testemunha {n}{"\n"}Nome:{"\n"}CPF:</Text>
              </View>
            ))}
          </View>
        </View>

        <Text
          fixed
          style={styles.rodape}
          render={({ pageNumber, totalPages }) =>
            `${doc.rascunho ? "Rascunho do contrato" : "Contrato"} nº ${doc.numero} · página ${pageNumber} de ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}

export async function gerarPdfContrato(contratoId: string): Promise<{ buffer: Buffer; nomeArquivo: string }> {
  const doc = await carregarDocumentoContrato(contratoId);
  const buffer = await renderToBuffer(<ContratoPdfDocument doc={doc} />);
  return { buffer, nomeArquivo: `${doc.nomeArquivo}${doc.rascunho ? "-rascunho" : ""}.pdf` };
}
