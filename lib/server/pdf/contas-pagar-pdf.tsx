import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { EMPRESA } from "@/lib/constants/empresa";
import { centavosParaReais } from "@/lib/utils/money";
import { diaBrasilia } from "@/lib/utils/brasilia";
import { descreverFiltro, listarContasPagar } from "@/lib/server/contas-pagar";
import {
  ROTULO_GRUPO,
  agruparContas,
  centroDaConta,
  dataBR,
  rotuloParcela,
  totaisPor,
  type ContaPagarVM,
  type FiltroContas,
} from "@/lib/utils/contas-pagar";

// Relatório de contas a pagar em PDF (pedido de 2026-11-23): os mesmos
// grupos e filtros da aba, com os totais por categoria e por centro/projeto.

const LOGO = fs.readFileSync(path.join(process.cwd(), "public", "legaus-logo.png"));

const cores = { teal: "#00A99D", tealClaro: "#d9f2ef", vermelho: "#b91c1c", cinza500: "#737373", cinza200: "#e5e5e5", cinza100: "#f5f5f5", texto: "#171717" };

const COLUNAS = { vencimento: "11%", fornecedor: "34%", categoria: "18%", centro: "23%", valor: "14%" } as const;

const styles = StyleSheet.create({
  page: { paddingTop: 32, paddingBottom: 56, paddingHorizontal: 32, fontSize: 9, fontFamily: "Helvetica", color: cores.texto },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: cores.teal, paddingBottom: 10 },
  logo: { width: 100, height: 44, objectFit: "contain" },
  headerDireita: { alignItems: "flex-end", gap: 2 },
  titulo: { fontSize: 16, fontWeight: 700 },
  cinza: { color: cores.cinza500, fontSize: 8 },
  filtro: { marginTop: 10, fontSize: 9, color: cores.cinza500 },
  resumo: { marginTop: 10, flexDirection: "row", gap: 8 },
  resumoCaixa: { flexGrow: 1, backgroundColor: cores.cinza100, borderRadius: 4, paddingVertical: 6, paddingHorizontal: 8 },
  resumoValor: { fontSize: 12, fontWeight: 700 },
  grupoTitulo: { marginTop: 14, flexDirection: "row", justifyContent: "space-between", backgroundColor: cores.tealClaro, paddingVertical: 4, paddingHorizontal: 6, fontWeight: 700 },
  cabecalhoTabela: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: cores.cinza200, paddingVertical: 3, fontSize: 7.5, color: cores.cinza500 },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: cores.cinza200, paddingVertical: 3.5 },
  celula: { paddingHorizontal: 3 },
  detalhe: { fontSize: 7.5, color: cores.cinza500, marginTop: 1 },
  valor: { textAlign: "right", fontWeight: 700 },
  totais: { marginTop: 18, flexDirection: "row", gap: 14 },
  totaisColuna: { flex: 1 },
  totaisTitulo: { fontWeight: 700, marginBottom: 3 },
  totaisLinha: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.5, borderBottomColor: cores.cinza200, paddingVertical: 2.5 },
  vazio: { marginTop: 24, textAlign: "center", color: cores.cinza500 },
  // Com "bottom" o react-pdf joga o rodapé para fora da folha (ver contrato-pdf.tsx); "top" fica certo.
  rodape: { position: "absolute", top: 806, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: "#a3a3a3" },
});

// A divisão de sílabas padrão do react-pdf é a do inglês ("in-sumos") — ver contrato-pdf.tsx.
const semHifenizar = (palavra: string) => [palavra];

function plural(n: number, singular: string, pluralTexto: string) {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

function LinhaConta({ conta: c }: { conta: ContaPagarVM }) {
  const parcela = rotuloParcela(c.parcela, c.totalParcelas);
  const detalhes = [c.descricao, parcela && `parcela ${parcela}`, c.repeteTodoMes && "conta fixa", c.pagaEm && `paga em ${dataBR(c.pagaEm)}`].filter(Boolean).join(" · ");
  return (
    <View style={styles.linha} wrap={false}>
      <Text style={[styles.celula, { width: COLUNAS.vencimento }]}>{dataBR(c.vencimento)}</Text>
      <View style={[styles.celula, { width: COLUNAS.fornecedor }]}>
        <Text hyphenationCallback={semHifenizar}>{c.fornecedor}</Text>
        {detalhes && (
          <Text style={styles.detalhe} hyphenationCallback={semHifenizar}>
            {detalhes}
          </Text>
        )}
      </View>
      <Text style={[styles.celula, { width: COLUNAS.categoria }]} hyphenationCallback={semHifenizar}>
        {c.categoriaNome ?? "Sem categoria"}
      </Text>
      <Text style={[styles.celula, { width: COLUNAS.centro }]} hyphenationCallback={semHifenizar}>
        {centroDaConta(c)}
      </Text>
      <Text style={[styles.celula, styles.valor, { width: COLUNAS.valor }]}>{centavosParaReais(c.valorCentavos)}</Text>
    </View>
  );
}

function Totais({ titulo, linhas }: { titulo: string; linhas: { nome: string; quantidade: number; totalCentavos: number }[] }) {
  return (
    <View style={styles.totaisColuna} wrap={false}>
      <Text style={styles.totaisTitulo}>{titulo}</Text>
      {linhas.map((l) => (
        <View key={l.nome} style={styles.totaisLinha}>
          <Text style={{ flex: 1 }} hyphenationCallback={semHifenizar}>
            {l.nome} <Text style={styles.cinza}>({l.quantidade})</Text>
          </Text>
          <Text style={{ fontWeight: 700 }}>{centavosParaReais(l.totalCentavos)}</Text>
        </View>
      ))}
    </View>
  );
}

function ContasPagarPdf({ contas, hoje, filtro, geradoEm }: { contas: ContaPagarVM[]; hoje: string; filtro: string; geradoEm: string }) {
  const grupos = agruparContas(contas, hoje);
  const total = contas.reduce((soma, c) => soma + c.valorCentavos, 0);
  const doGrupo = (g: string) => grupos.find((x) => x.grupo === g)?.totalCentavos ?? 0;
  const temAbertas = contas.some((c) => c.status === "ABERTA");
  return (
    <Document title="Contas a pagar">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image aqui é do @react-pdf/renderer (destino é PDF), não HTML img */}
          <Image src={LOGO} style={styles.logo} />
          <View style={styles.headerDireita}>
            <Text style={styles.titulo}>Contas a pagar</Text>
            <Text style={styles.cinza}>{EMPRESA.razaoSocial}</Text>
            <Text style={styles.cinza}>Gerado em {geradoEm}</Text>
          </View>
        </View>
        <Text style={styles.filtro} hyphenationCallback={semHifenizar}>
          {filtro}
        </Text>

        <View style={styles.resumo}>
          <View style={styles.resumoCaixa}>
            <Text style={styles.cinza}>Total ({plural(contas.length, "conta", "contas")})</Text>
            <Text style={styles.resumoValor}>{centavosParaReais(total)}</Text>
          </View>
          {temAbertas && (
            <>
              <View style={styles.resumoCaixa}>
                <Text style={styles.cinza}>Atrasadas</Text>
                <Text style={[styles.resumoValor, { color: cores.vermelho }]}>{centavosParaReais(doGrupo("ATRASADAS"))}</Text>
              </View>
              <View style={styles.resumoCaixa}>
                <Text style={styles.cinza}>Vence hoje</Text>
                <Text style={styles.resumoValor}>{centavosParaReais(doGrupo("HOJE"))}</Text>
              </View>
              <View style={styles.resumoCaixa}>
                <Text style={styles.cinza}>Próximos 7 dias</Text>
                <Text style={styles.resumoValor}>{centavosParaReais(doGrupo("SETE_DIAS"))}</Text>
              </View>
            </>
          )}
        </View>

        {contas.length === 0 && <Text style={styles.vazio}>Nenhuma conta com esse filtro.</Text>}

        {grupos.map((g) => (
          <View key={g.grupo}>
            <View style={styles.grupoTitulo} wrap={false} minPresenceAhead={40}>
              <Text style={g.grupo === "ATRASADAS" ? { color: cores.vermelho } : {}}>
                {ROTULO_GRUPO[g.grupo]} · {plural(g.contas.length, "conta", "contas")}
              </Text>
              <Text>{centavosParaReais(g.totalCentavos)}</Text>
            </View>
            <View style={styles.cabecalhoTabela} wrap={false}>
              <Text style={[styles.celula, { width: COLUNAS.vencimento }]}>Vencimento</Text>
              <Text style={[styles.celula, { width: COLUNAS.fornecedor }]}>Fornecedor</Text>
              <Text style={[styles.celula, { width: COLUNAS.categoria }]}>Categoria</Text>
              <Text style={[styles.celula, { width: COLUNAS.centro }]}>Centro/projeto</Text>
              <Text style={[styles.celula, { width: COLUNAS.valor, textAlign: "right" }]}>Valor</Text>
            </View>
            {g.contas.map((c) => (
              <LinhaConta key={c.id} conta={c} />
            ))}
          </View>
        ))}

        {contas.length > 0 && (
          <View style={styles.totais}>
            <Totais titulo="Por categoria" linhas={totaisPor(contas, (c) => c.categoriaNome ?? "Sem categoria")} />
            <Totais titulo="Por centro/projeto" linhas={totaisPor(contas, centroDaConta)} />
          </View>
        )}

        <View style={styles.rodape} fixed>
          <Text>Legaus Kids · Contas a pagar</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** O PDF a partir das contas já carregadas (separado para testar sem banco). */
export function renderizarPdfContas(contas: ContaPagarVM[], filtro: string, agora = new Date()): Promise<Buffer> {
  const geradoEm = agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  return renderToBuffer(<ContasPagarPdf contas={contas} hoje={diaBrasilia(agora)} filtro={filtro} geradoEm={geradoEm} />);
}

export async function gerarPdfContasPagar(filtro: FiltroContas): Promise<{ buffer: Buffer; nomeArquivo: string }> {
  const [contas, descricao] = await Promise.all([listarContasPagar(filtro), descreverFiltro(filtro)]);
  return { buffer: await renderizarPdfContas(contas, descricao), nomeArquivo: `contas-a-pagar-${diaBrasilia(new Date())}.pdf` };
}
