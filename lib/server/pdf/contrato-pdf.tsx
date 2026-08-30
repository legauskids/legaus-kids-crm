import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { EMPRESA } from "@/lib/constants/empresa";
import { centavosParaReais } from "@/lib/utils/money";

const LOGO = fs.readFileSync(path.join(process.cwd(), "public", "legaus-logo.png"));

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, fontFamily: "Helvetica", color: "#171717", lineHeight: 1.45 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: "#00A99D", paddingBottom: 12, marginBottom: 4 },
  logo: { width: 100, height: 44, objectFit: "contain" },
  empresaBloco: { alignItems: "flex-end", fontSize: 7.5, color: "#737373", gap: 1.5 },
  aviso: { marginTop: 8, marginBottom: 14, backgroundColor: "#fff4e5", borderWidth: 1, borderColor: "#f0c36d", borderRadius: 4, padding: 8, fontSize: 8, color: "#8a5a00" },
  titulo: { fontSize: 14, fontWeight: 700, textAlign: "center", marginTop: 4, marginBottom: 14, textTransform: "uppercase" },
  paragrafo: { marginBottom: 8, textAlign: "justify" },
  clausulaTitulo: { fontWeight: 700, fontSize: 9.5, marginTop: 10, marginBottom: 4 },
  partesBox: { gap: 6, marginBottom: 10 },
  parteLinha: { fontSize: 9 },
  negrito: { fontWeight: 700 },
  tabelaResumo: { marginTop: 4, marginBottom: 10, borderWidth: 1, borderColor: "#e5e5e5", borderRadius: 4 },
  linhaResumo: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f0f0f0", paddingVertical: 5, paddingHorizontal: 8 },
  linhaResumoLabel: { width: 130, fontSize: 8.5, color: "#737373" },
  linhaResumoValor: { flex: 1, fontSize: 9 },
  assinaturas: { marginTop: 36, flexDirection: "row", justifyContent: "space-between" },
  assinaturaBox: { width: "45%", alignItems: "center" },
  linhaAssinatura: { borderTopWidth: 1, borderTopColor: "#171717", width: "100%", marginBottom: 4, marginTop: 28 },
  assinaturaLabel: { fontSize: 8.5, textAlign: "center" },
  rodape: { marginTop: 24, borderTopWidth: 1, borderTopColor: "#e5e5e5", paddingTop: 8, fontSize: 7, color: "#a3a3a3", textAlign: "center" },
});

function formatarData(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(data);
}

type ContratoPdfVM = {
  titulo: string;
  produto: string | null;
  descricao: string | null;
  valorCentavos: number;
  previsaoFechamento: Date | null;
  dataInstalacao: Date | null;
  responsavel: { nome: string };
  contato: {
    nome: string;
    razaoSocial: string | null;
    cnpj: string | null;
    endereco: string | null;
    cidade: string | null;
    uf: string | null;
    email: string | null;
    telefone: string | null;
  } | null;
};

function ContratoPdfDocument({ contrato }: { contrato: ContratoPdfVM }) {
  const hoje = new Date();
  const contratante = contrato.contato;

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
          MODELO GERADO AUTOMATICAMENTE — revise as cláusulas, condições de pagamento e prazos com um advogado/contador antes de
          usar este documento como contrato definitivo com o cliente.
        </Text>

        <Text style={styles.titulo}>Contrato de Fornecimento e Instalação</Text>

        <View style={styles.partesBox}>
          <Text style={styles.parteLinha}>
            <Text style={styles.negrito}>CONTRATADA: </Text>
            {EMPRESA.razaoSocial}, CNPJ {EMPRESA.cnpj}, com sede em {EMPRESA.endereco}, {EMPRESA.bairro}, {EMPRESA.cidade}/{EMPRESA.uf},
            CEP {EMPRESA.cep}, doravante denominada CONTRATADA.
          </Text>
          <Text style={styles.parteLinha}>
            <Text style={styles.negrito}>CONTRATANTE: </Text>
            {contratante ? (
              <>
                {contratante.razaoSocial || contratante.nome}
                {contratante.cnpj ? `, CNPJ ${contratante.cnpj}` : ""}
                {contratante.endereco ? `, com endereço em ${contratante.endereco}` : ""}
                {contratante.cidade ? `, ${contratante.cidade}/${contratante.uf}` : ""}
                {contratante.telefone ? `, telefone ${contratante.telefone}` : ""}
                , doravante denominado(a) CONTRATANTE.
              </>
            ) : (
              "(dados do cliente não cadastrados — preencher antes de assinar)"
            )}
          </Text>
        </View>

        <Text style={styles.clausulaTitulo}>Cláusula 1ª — Do objeto</Text>
        <Text style={styles.paragrafo}>
          O presente contrato tem por objeto o fornecimento{contrato.produto ? ` de ${contrato.produto}` : ""}
          {contrato.descricao ? `, conforme especificado a seguir: ${contrato.descricao}` : ""}, referente ao negócio &quot;{contrato.titulo}&quot;,
          incluindo fabricação, entrega e instalação no endereço do CONTRATANTE, conforme condições comerciais previamente acordadas.
        </Text>

        <Text style={styles.clausulaTitulo}>Cláusula 2ª — Do valor e forma de pagamento</Text>
        <View style={styles.tabelaResumo}>
          <View style={styles.linhaResumo}>
            <Text style={styles.linhaResumoLabel}>Valor total</Text>
            <Text style={styles.linhaResumoValor}>{centavosParaReais(contrato.valorCentavos)}</Text>
          </View>
          <View style={[styles.linhaResumo, { borderBottomWidth: 0 }]}>
            <Text style={styles.linhaResumoLabel}>Forma de pagamento</Text>
            <Text style={styles.linhaResumoValor}>A combinar entre as partes (preencher antes da assinatura)</Text>
          </View>
        </View>
        <Text style={styles.paragrafo}>
          O valor total dos serviços/produtos contratados é o indicado acima, a ser pago conforme condições e prazos definidos entre as
          partes previamente à assinatura deste instrumento.
        </Text>

        <Text style={styles.clausulaTitulo}>Cláusula 3ª — Do prazo</Text>
        <Text style={styles.paragrafo}>
          Previsão de fechamento/entrega: {contrato.previsaoFechamento ? formatarData(contrato.previsaoFechamento) : "a combinar"}.
          Previsão de instalação: {contrato.dataInstalacao ? formatarData(contrato.dataInstalacao) : "a combinar"}. Os prazos poderão
          ser ajustados mediante acordo entre as partes, especialmente em razão de disponibilidade de material ou condições climáticas
          para a instalação.
        </Text>

        <Text style={styles.clausulaTitulo}>Cláusula 4ª — Da garantia</Text>
        <Text style={styles.paragrafo}>
          A CONTRATADA garante os produtos fornecidos contra defeitos de fabricação pelo prazo de 12 (doze) meses a contar da data de
          instalação, conforme disposto no Código de Defesa do Consumidor (Lei nº 8.078/1990), não estando cobertos danos decorrentes
          de mau uso, vandalismo ou desgaste natural.
        </Text>

        <Text style={styles.clausulaTitulo}>Cláusula 5ª — Da rescisão</Text>
        <Text style={styles.paragrafo}>
          O presente contrato poderá ser rescindido por qualquer das partes em caso de descumprimento das obrigações aqui previstas,
          mediante notificação prévia por escrito, resguardado o direito ao ressarcimento de valores já pagos proporcionalmente aos
          serviços não executados.
        </Text>

        <Text style={styles.clausulaTitulo}>Cláusula 6ª — Do foro</Text>
        <Text style={styles.paragrafo}>
          Fica eleito o foro da comarca de {EMPRESA.cidade}/{EMPRESA.uf} para dirimir quaisquer dúvidas oriundas deste contrato,
          com renúncia expressa a qualquer outro, por mais privilegiado que seja.
        </Text>

        <Text style={[styles.paragrafo, { marginTop: 10 }]}>
          E por estarem assim justas e contratadas, as partes assinam o presente instrumento em duas vias de igual teor.
        </Text>
        <Text style={styles.paragrafo}>{EMPRESA.cidade}/{EMPRESA.uf}, {formatarData(hoje)}.</Text>

        <View style={styles.assinaturas}>
          <View style={styles.assinaturaBox}>
            <View style={styles.linhaAssinatura} />
            <Text style={styles.assinaturaLabel}>{EMPRESA.razaoSocial}{"\n"}CONTRATADA</Text>
          </View>
          <View style={styles.assinaturaBox}>
            <View style={styles.linhaAssinatura} />
            <Text style={styles.assinaturaLabel}>{contratante?.razaoSocial || contratante?.nome || "Cliente"}{"\n"}CONTRATANTE</Text>
          </View>
        </View>

        <View style={styles.rodape}>
          <Text>Documento gerado automaticamente pelo CRM da {EMPRESA.nomeFantasia} em {formatarData(hoje)} — modelo sujeito a revisão.</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function gerarPdfContrato(negocioId: string): Promise<{ buffer: Buffer; nomeArquivo: string }> {
  const negocio = await prisma.negocio.findUnique({
    where: { id: negocioId },
    include: { contato: true, responsavel: true },
  });
  if (!negocio) throw new Error("Negócio não encontrado.");

  const buffer = await renderToBuffer(
    <ContratoPdfDocument
      contrato={{
        titulo: negocio.titulo,
        produto: negocio.produto,
        descricao: negocio.descricao,
        valorCentavos: negocio.valorCentavos,
        previsaoFechamento: negocio.previsaoFechamento,
        dataInstalacao: negocio.dataInstalacao,
        responsavel: { nome: negocio.responsavel.nome },
        contato: negocio.contato
          ? {
              nome: negocio.contato.nome,
              razaoSocial: negocio.contato.razaoSocial,
              cnpj: negocio.contato.cnpj,
              endereco: negocio.contato.endereco,
              cidade: negocio.contato.cidade,
              uf: negocio.contato.uf,
              email: negocio.contato.email,
              telefone: negocio.contato.telefone,
            }
          : null,
      }}
    />,
  );

  return { buffer, nomeArquivo: `contrato-${negocio.titulo.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.pdf` };
}
