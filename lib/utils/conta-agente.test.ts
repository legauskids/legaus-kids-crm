import { describe, expect, it } from "vitest";
import { LIMITE_DADOS_BOTAO, lerBotao } from "./agente-canal";
import { interpretarRespostaRascunho } from "./despesa-agente";
import {
  botoesDaConta,
  botoesDeCategoriasConta,
  botoesDeCentrosConta,
  botoesDePagamento,
  codigoCurto,
  enqueteDaConta,
  enqueteDePagamento,
  mensagemContaLancada,
  mensagemDaConta,
  montarContaDaMensagem,
  parcelasValidas,
  pareceRespostaDeConta,
  pendenciasDaConta,
  perguntaDePagamento,
  resolverVencimentoFalado,
} from "./conta-agente";

// cuid de 25 letras, como os ids de verdade.
const ID = "cmi3x9k2p0000abcd1234efgh";
const OUTRO = "cmi3x9k2p0000zzzz9999yyyy";
const hoje = "2026-11-23"; // segunda-feira

describe("vencimento falado ou impresso (pedido de 2026-11-23)", () => {
  it("impresso no boleto", () => {
    expect(resolverVencimentoFalado("10/12/2026", hoje)).toBe("2026-12-10");
    expect(resolverVencimentoFalado("Vencimento: 05/01/27", hoje)).toBe("2027-01-05");
    expect(resolverVencimentoFalado("2026-12-10", hoje)).toBe("2026-12-10");
  });
  it("sem ano: o mais perto de hoje (boleto vencido há pouco continua deste ano)", () => {
    expect(resolverVencimentoFalado("10/12", hoje)).toBe("2026-12-10");
    expect(resolverVencimentoFalado("10/11", hoje)).toBe("2026-11-10");
    expect(resolverVencimentoFalado("05/01", hoje)).toBe("2027-01-05");
    expect(resolverVencimentoFalado("10 de dezembro", hoje)).toBe("2026-12-10");
  });
  it("'dia 10' é o próximo dia 10", () => {
    expect(resolverVencimentoFalado("vence dia 10", hoje)).toBe("2026-12-10");
    expect(resolverVencimentoFalado("dia 30", hoje)).toBe("2026-11-30");
    expect(resolverVencimentoFalado("dia 23", hoje)).toBe("2026-11-23");
    // Mês seguinte mais curto: o último dia.
    expect(resolverVencimentoFalado("dia 31", "2027-01-31")).toBe("2027-01-31");
    expect(resolverVencimentoFalado("dia 30", "2027-01-31")).toBe("2027-02-28");
  });
  it("palavras", () => {
    expect(resolverVencimentoFalado("hoje", hoje)).toBe(hoje);
    expect(resolverVencimentoFalado("amanhã", hoje)).toBe("2026-11-24");
    expect(resolverVencimentoFalado("depois de amanhã", hoje)).toBe("2026-11-25");
    expect(resolverVencimentoFalado("sexta", hoje)).toBe("2026-11-27");
    expect(resolverVencimentoFalado("segunda", hoje)).toBe(hoje);
    expect(resolverVencimentoFalado("segunda que vem", hoje)).toBe("2026-11-30");
    expect(resolverVencimentoFalado("", hoje)).toBeNull();
    expect(resolverVencimentoFalado("sei lá", hoje)).toBeNull();
    expect(resolverVencimentoFalado("31/02", hoje)).toBeNull();
  });
});

const cadastros = {
  categorias: [
    { id: "cat-energia-0001", nome: "Energia elétrica", centroGeralPadraoId: "cg-adm", palavrasChave: ["rge", "energia"] },
    { id: "cat-aluguel-0001", nome: "Aluguel", centroGeralPadraoId: "cg-adm" },
  ],
  centrosGerais: [
    { id: "cg-adm", nome: "Administrativo" },
    { id: "cg-prod", nome: "Produção" },
  ],
  negocios: [{ id: "neg1", titulo: "Playground Escola Arco-Íris", contatoNome: "Escola" }],
};

describe("conta montada da mensagem", () => {
  it("boleto: valor, vencimento, código; categoria e centro deduzidos", () => {
    const m = montarContaDaMensagem({
      texto: "",
      hoje,
      extracao: { valor: 487.9, fornecedor: "RGE Sul", vencimentoTexto: "10/12/2026", categoria: "Energia elétrica", codigoPagamento: " 8366 0000 " },
      ...cadastros,
    });
    expect(m.dados).toMatchObject({ vencimento: "2026-12-10", valorCentavos: 48790, fornecedor: "RGE Sul", categoriaId: "cat-energia-0001", centroGeralId: "cg-adm", codigoPagamento: "8366 0000", totalParcelas: null, repeteTodoMes: false });
    expect(m.categoriaDeclarada).toBe(false);
  });
  it("parcelas valem de 2 a 48 e anulam a repetição", () => {
    const m = montarContaDaMensagem({ texto: "", hoje, extracao: { valor: 100, fornecedor: "X", vencimentoTexto: "dia 5", parcelas: 3, repeteTodoMes: true }, ...cadastros });
    expect(m.dados.totalParcelas).toBe(3);
    expect(m.dados.repeteTodoMes).toBe(false);
    expect(parcelasValidas(1)).toBeNull();
    expect(parcelasValidas(49)).toBeNull();
    expect(parcelasValidas(2.5)).toBeNull();
  });
  it("sem vencimento: falta o vencimento", () => {
    const m = montarContaDaMensagem({ texto: "", hoje, extracao: { valor: 100, fornecedor: "X", categoria: "Aluguel" }, ...cadastros });
    expect(m.dados.vencimento).toBeNull();
    expect(pendenciasDaConta({ ...m.dados, vencimentoInformado: false })).toEqual(["vencimento"]);
    expect(pendenciasDaConta({ ...m.dados, valorCentavos: 0, vencimentoInformado: true })).toEqual(["valor"]);
  });
  it("fornecedor '<UNKNOWN>' do modelo fica vazio", () => {
    const m = montarContaDaMensagem({ texto: "", hoje, extracao: { valor: 10, fornecedor: "<UNKNOWN>" }, ...cadastros });
    expect(m.dados.fornecedor).toBe("");
  });
  it("centro dito: a obra", () => {
    const m = montarContaDaMensagem({ texto: "boleto da madeira da obra do Arco-Íris", hoje, extracao: { valor: 100, fornecedor: "Madeireira", centro: "obra do Arco-Íris" }, ...cadastros });
    expect(m.dados.negocioId).toBe("neg1");
    expect(m.nomes.centroEhProjeto).toBe(true);
  });
});

describe("mensagens, enquete e botões", () => {
  const dados = { vencimento: "2026-12-10", valorCentavos: 48790, fornecedor: "RGE Sul", codigoPagamento: "83660000004887900048000112345678901234567890", totalParcelas: null, repeteTodoMes: false };
  const nomes = { categoria: "Energia elétrica", centro: "Administrativo", centroEhProjeto: false };

  it("resumo pedindo confirmação", () => {
    const m = mensagemDaConta({ dados, nomes, faltando: [], categoriaDeduzida: true, temArquivo: true }, hoje, undefined, "whatsapp");
    expect(m).toContain("📄 *R$ 487,90* — RGE Sul");
    expect(m).toContain("📅 Vence 10/12/2026 (vence em 17 dias)");
    expect(m).toContain("Energia elétrica _(deduzida)_");
    expect(m).toContain("🔑 Código para pagar: 836600000048879000480001…");
    expect(m).toContain("📎 O arquivo fica guardado");
    expect(m).toContain("enquete abaixo");
    expect(pareceRespostaDeConta(m)).toBe(true);
    // Resposta de consulta (listar_contas_pagar) não é lançamento.
    expect(pareceRespostaDeConta("📄 Esta semana vencem 2 contas: RGE (R$ 487,90) e Unimed (R$ 890,00).")).toBe(false);
  });
  it("parcelas e vencimento que falta", () => {
    const m = mensagemDaConta({ dados: { ...dados, vencimento: null, totalParcelas: 3 }, nomes, faltando: ["vencimento"] }, hoje, undefined, "telegram");
    expect(m).toContain("📅 Vencimento: ?");
    expect(m).toContain('Me diga o vencimento (ex.: "vence dia 10")');
    const p = mensagemDaConta({ dados: { ...dados, totalParcelas: 3 }, nomes, faltando: [] }, hoje);
    expect(p).toContain("*R$ 487,90* por parcela");
    expect(p).toContain("3 parcelas, a última em 10/02/2027 — total R$ 1.463,70");
    expect(mensagemContaLancada({ ...dados, repeteTodoMes: true }, hoje)).toContain("🔁 Repete todo mês");
    expect(codigoCurto("123")).toBe("123");
  });
  it("enquete com ref da conta", () => {
    const e = enqueteDaConta({ id: ID, valorCentavos: 48790, fornecedor: "RGE Sul", ehProjeto: false });
    expect(e.ref).toBe(`conta:${ID}`);
    expect(e.opcoes).toHaveLength(3);
    expect(enqueteDaConta({ id: ID, valorCentavos: 0, fornecedor: "", ehProjeto: true }).opcoes).toHaveLength(2);
  });
  it("todo botão cabe no Telegram e volta lido", () => {
    const botoes = [
      ...botoesDaConta({ id: ID, ehProjeto: false, categoria: "Energia", categoriaDeduzida: true, centro: "Administrativo", centroDeduzido: true }),
      ...botoesDeCategoriasConta(ID, [{ id: "cat-energia-0001", nome: "Energia" }], null),
      ...botoesDeCentrosConta(ID, [{ id: "cg-administrativo", nome: "Administrativo" }], null),
      ...botoesDePagamento(ID, OUTRO),
    ].flat();
    for (const b of botoes) {
      expect(new TextEncoder().encode(b.dados).length).toBeLessThanOrEqual(LIMITE_DADOS_BOTAO);
      expect(lerBotao(b.dados)).not.toBeNull();
    }
  });
});

describe("botões de conta e de pagamento", () => {
  it("lerBotao", () => {
    expect(lerBotao(`cp:ok:${ID}`)).toEqual({ tipo: "conta", acao: "ok", contaId: ID });
    expect(lerBotao(`cp:u:${ID}`)).toBeNull();
    expect(lerBotao(`cpc:${ID}:cat-ener`)).toEqual({ tipo: "conta-categoria", contaId: ID, prefixo: "cat-ener" });
    expect(lerBotao(`cpg:${ID}:cg-adm`)).toEqual({ tipo: "conta-centro", contaId: ID, centroGeralId: "cg-adm" });
    expect(lerBotao(`pg:${ID}:${OUTRO}`)).toEqual({ tipo: "pagamento", contaId: ID, despesaId: OUTRO });
    expect(lerBotao(`pn:${OUTRO}`)).toEqual({ tipo: "pagamento-nao", despesaId: OUTRO });
    expect(lerBotao(`pg:${ID}`)).toBeNull();
  });
  it("pergunta do pagamento", () => {
    const conta = { id: ID, fornecedor: "Madeireira", valorCentavos: 10000, vencimento: "2026-11-30", parcela: 2, totalParcelas: 3 };
    expect(perguntaDePagamento(conta)).toBe("🧾 Esse valor é o de uma conta a pagar em aberto: *Madeireira (parcela 2/3)* — R$ 100,00, vence 30/11/2026. É o pagamento dela?");
    expect(enqueteDePagamento(conta, OUTRO)).toEqual({
      pergunta: "É o pagamento da conta Madeireira (parcela 2/3) (vence 30/11)?",
      opcoes: ["✅ Sim, é essa conta", "➖ Não"],
      ref: `pagamento:${ID}:${OUTRO}`,
    });
  });
  it("'pode lançar a conta' confirma, 'descarta essa conta' descarta", () => {
    expect(interpretarRespostaRascunho("Pode lançar.")).toBe("confirmar");
    expect(interpretarRespostaRascunho("confirma a conta")).toBe("confirmar");
    expect(interpretarRespostaRascunho("descarta essa conta")).toBe("descartar");
    expect(interpretarRespostaRascunho("não, vence dia 15")).toBe("outro");
  });
});
