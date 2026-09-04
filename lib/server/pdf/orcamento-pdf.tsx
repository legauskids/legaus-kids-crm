import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { EMPRESA } from "@/lib/constants/empresa";
import { centavosParaReais } from "@/lib/utils/money";
import { buscarOrcamentoPorId, calcularTotalCentavos } from "@/lib/server/orcamentos";

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  ENVIADO: "Enviado",
  APROVADO: "Aprovado",
  RECUSADO: "Recusado",
  EXPIRADO: "Expirado",
};

const LOGO = fs.readFileSync(path.join(process.cwd(), "public", "legaus-logo.png"));

const cores = { teal: "#00A99D", tealEscuro: "#00655c", tealClaro: "#d9f2ef", cinza500: "#737373", cinza300: "#d4d4d4", cinza100: "#f5f5f5", texto: "#171717" };

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: cores.texto },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: cores.teal, paddingBottom: 12 },
  logo: { width: 110, height: 48, objectFit: "contain" },
  empresaBloco: { alignItems: "flex-end", fontSize: 8, color: cores.cinza500, gap: 1.5 },
  empresaNome: { fontWeight: 700, color: cores.texto, fontSize: 9 },
  tituloLinha: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: 18 },
  titulo: { fontSize: 18, fontWeight: 700 },
  subtitulo: { fontSize: 9, color: cores.cinza500, marginTop: 2 },
  statusPill: { backgroundColor: cores.tealClaro, color: cores.tealEscuro, fontSize: 8, fontWeight: 700, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10 },
  clienteBox: { marginTop: 12, backgroundColor: cores.cinza100, borderRadius: 6, padding: 10, gap: 1.5 },
  clienteNome: { fontWeight: 700, fontSize: 10 },
  clienteLinha: { fontSize: 8.5, color: "#525252" },
  tabela: { marginTop: 18 },
  linhaCabecalho: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: cores.cinza300, paddingBottom: 5 },
  linhaItem: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: cores.cinza100, paddingVertical: 6 },
  colItem: { flex: 5, flexDirection: "row", alignItems: "center", gap: 8 },
  colQtd: { flex: 1, textAlign: "right" },
  colValor: { flex: 1.4, textAlign: "right" },
  colSubtotal: { flex: 1.4, textAlign: "right" },
  cabecalhoTexto: { fontSize: 7.5, textTransform: "uppercase", color: cores.cinza500, letterSpacing: 0.5 },
  itemFoto: { width: 32, height: 32, borderRadius: 4, objectFit: "cover" },
  itemTextos: { flex: 1 },
  itemNome: { fontSize: 9.5 },
  itemDescricao: { fontSize: 7.5, color: cores.cinza500, marginTop: 2 },
  totais: { marginTop: 12, alignItems: "flex-end" },
  totaisBloco: { width: 190, gap: 3 },
  totaisLinha: { flexDirection: "row", justifyContent: "space-between" },
  totaisLabel: { color: cores.cinza500, fontSize: 8.5 },
  totalFinal: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: cores.cinza300, paddingTop: 4, marginTop: 2 },
  totalFinalLabel: { fontSize: 10.5, fontWeight: 700 },
  totalFinalValor: { fontSize: 10.5, fontWeight: 700 },
  observacoes: { marginTop: 18, borderTopWidth: 1, borderTopColor: "#e5e5e5", paddingTop: 10 },
  observacoesTitulo: { fontWeight: 700, fontSize: 9, marginBottom: 3 },
  observacoesTexto: { fontSize: 8.5, color: "#525252" },
  rodape: { marginTop: 24, borderTopWidth: 1, borderTopColor: "#e5e5e5", paddingTop: 8, fontSize: 7.5, color: "#a3a3a3" },
});

function formatarData(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR").format(data);
}

function compactarDescricao(texto: string): string {
  return texto.replace(/\n{2,}/g, "\n").trim();
}

type OrcamentoPdfVM = {
  numero: number;
  status: string;
  createdAt: Date;
  validadeDias: number;
  observacoes: string | null;
  descontoCentavos: number;
  contato: { nome: string; razaoSocial: string | null; cnpj: string | null; telefone: string | null; endereco: string | null; cidade: string | null; uf: string | null } | null;
  responsavel: { nome: string };
  itens: { nome: string; descricao: string | null; quantidade: number; valorUnitarioCentavos: number; imagemUrl: string | null }[];
};

function OrcamentoPdfDocument({ orcamento }: { orcamento: OrcamentoPdfVM }) {
  const subtotal = orcamento.itens.reduce((soma, item) => soma + item.quantidade * item.valorUnitarioCentavos, 0);
  const total = calcularTotalCentavos(orcamento.itens, orcamento.descontoCentavos);
  const validade = new Date(orcamento.createdAt);
  validade.setDate(validade.getDate() + orcamento.validadeDias);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image aqui é do @react-pdf/renderer (destino é PDF), não HTML img */}
          <Image src={LOGO} style={styles.logo} />
          <View style={styles.empresaBloco}>
            <Text style={styles.empresaNome}>{EMPRESA.razaoSocial}</Text>
            <Text>CNPJ {EMPRESA.cnpj}</Text>
            <Text>{EMPRESA.endereco}, {EMPRESA.bairro} — {EMPRESA.cidade}/{EMPRESA.uf}</Text>
            <Text>CEP {EMPRESA.cep}</Text>
            <Text>{EMPRESA.telefone} · {EMPRESA.email}</Text>
          </View>
        </View>

        <View style={styles.tituloLinha}>
          <View>
            <Text style={styles.titulo}>Orçamento nº {String(orcamento.numero).padStart(4, "0")}</Text>
            <Text style={styles.subtitulo}>Emitido em {formatarData(orcamento.createdAt)} · Válido até {formatarData(validade)}</Text>
          </View>
          <Text style={styles.statusPill}>{STATUS_LABEL[orcamento.status] ?? orcamento.status}</Text>
        </View>

        {orcamento.contato && (
          <View style={styles.clienteBox}>
            <Text style={styles.clienteNome}>{orcamento.contato.nome}</Text>
            {orcamento.contato.razaoSocial && <Text style={styles.clienteLinha}>{orcamento.contato.razaoSocial}</Text>}
            {orcamento.contato.cnpj && <Text style={styles.clienteLinha}>CNPJ {orcamento.contato.cnpj}</Text>}
            {orcamento.contato.telefone && <Text style={styles.clienteLinha}>{orcamento.contato.telefone}</Text>}
            {orcamento.contato.endereco && (
              <Text style={styles.clienteLinha}>
                {orcamento.contato.endereco}
                {orcamento.contato.cidade ? ` — ${orcamento.contato.cidade}/${orcamento.contato.uf}` : ""}
              </Text>
            )}
          </View>
        )}

        <View style={styles.tabela}>
          <View style={styles.linhaCabecalho}>
            <Text style={[styles.colItem, styles.cabecalhoTexto]}>Item</Text>
            <Text style={[styles.colQtd, styles.cabecalhoTexto]}>Qtd.</Text>
            <Text style={[styles.colValor, styles.cabecalhoTexto]}>Valor unit.</Text>
            <Text style={[styles.colSubtotal, styles.cabecalhoTexto]}>Subtotal</Text>
          </View>
          {orcamento.itens.map((item, i) => (
            <View key={i} style={styles.linhaItem} wrap={false}>
              <View style={styles.colItem}>
                {item.imagemUrl && (
                  // eslint-disable-next-line jsx-a11y/alt-text -- Image aqui é do @react-pdf/renderer (destino é PDF), não HTML img
                  <Image src={item.imagemUrl} style={styles.itemFoto} />
                )}
                <View style={styles.itemTextos}>
                  <Text style={styles.itemNome}>{item.nome}</Text>
                  {item.descricao && <Text style={styles.itemDescricao}>{compactarDescricao(item.descricao)}</Text>}
                </View>
              </View>
              <Text style={styles.colQtd}>{item.quantidade}</Text>
              <Text style={styles.colValor}>{centavosParaReais(item.valorUnitarioCentavos)}</Text>
              <Text style={styles.colSubtotal}>{centavosParaReais(item.quantidade * item.valorUnitarioCentavos)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totais}>
          <View style={styles.totaisBloco}>
            <View style={styles.totaisLinha}>
              <Text style={styles.totaisLabel}>Subtotal</Text>
              <Text>{centavosParaReais(subtotal)}</Text>
            </View>
            {orcamento.descontoCentavos > 0 && (
              <View style={styles.totaisLinha}>
                <Text style={styles.totaisLabel}>Desconto</Text>
                <Text>-{centavosParaReais(orcamento.descontoCentavos)}</Text>
              </View>
            )}
            <View style={styles.totalFinal}>
              <Text style={styles.totalFinalLabel}>Total</Text>
              <Text style={styles.totalFinalValor}>{centavosParaReais(total)}</Text>
            </View>
          </View>
        </View>

        {orcamento.observacoes && (
          <View style={styles.observacoes}>
            <Text style={styles.observacoesTitulo}>Observações</Text>
            <Text style={styles.observacoesTexto}>{orcamento.observacoes}</Text>
          </View>
        )}

        <View style={styles.rodape}>
          <Text>Responsável: {orcamento.responsavel.nome} · {EMPRESA.nomeFantasia} — {EMPRESA.site}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function gerarPdfOrcamento(orcamentoId: string): Promise<{ buffer: Buffer; nomeArquivo: string }> {
  const orcamento = await buscarOrcamentoPorId(orcamentoId);
  if (!orcamento) throw new Error("Orçamento não encontrado.");

  const buffer = await renderToBuffer(
    <OrcamentoPdfDocument
      orcamento={{
        numero: orcamento.numero,
        status: orcamento.status,
        createdAt: orcamento.createdAt,
        validadeDias: orcamento.validadeDias,
        observacoes: orcamento.observacoes,
        descontoCentavos: orcamento.descontoCentavos,
        contato: orcamento.contato
          ? {
              nome: orcamento.contato.nome,
              razaoSocial: orcamento.contato.razaoSocial,
              cnpj: orcamento.contato.cnpj,
              telefone: orcamento.contato.telefone,
              endereco: orcamento.contato.endereco,
              cidade: orcamento.contato.cidade,
              uf: orcamento.contato.uf,
            }
          : null,
        responsavel: { nome: orcamento.responsavel.nome },
        itens: orcamento.itens.map((i) => ({
          nome: i.nome,
          descricao: i.descricao,
          quantidade: i.quantidade,
          valorUnitarioCentavos: i.valorUnitarioCentavos,
          imagemUrl: i.produto?.imagemUrl ?? null,
        })),
      }}
    />,
  );

  return { buffer, nomeArquivo: `orcamento-${String(orcamento.numero).padStart(4, "0")}.pdf` };
}
