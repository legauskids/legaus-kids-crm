import { describe, expect, it } from "vitest";
import { lerBotao } from "./agente-canal";
import {
  botoesCotacaoSalva,
  dataDaCotacao,
  idadeDaCotacao,
  itensDaExtracao,
  itensQueCombinam,
  mensagemCotacaoSalva,
  mesmoFornecedor,
  nomeDeEmpresaComparavel,
  normalizarBusca,
  pontosDoTermo,
  precoDoItem,
  tituloDaCotacao,
  validadeDaCotacao,
} from "./cotacao-fornecedor";

const hoje = "2026-11-24";

describe("data e validade da cotação", () => {
  it("data impressa, falada ou nenhuma", () => {
    expect(dataDaCotacao("20/11/2026", hoje)).toBe("2026-11-20");
    expect(dataDaCotacao("Data: 18/11/26", hoje)).toBe("2026-11-18");
    expect(dataDaCotacao("2026-11-10", hoje)).toBe("2026-11-10");
    expect(dataDaCotacao("15 de outubro", hoje)).toBe("2026-10-15");
    expect(dataDaCotacao("ontem", hoje)).toBe("2026-11-23");
    expect(dataDaCotacao("", hoje)).toBe(hoje);
    expect(dataDaCotacao(null, hoje)).toBe(hoje);
  });
  it("sem ano: a mais recente até hoje; data futura não vale", () => {
    expect(dataDaCotacao("20/12", "2027-01-10")).toBe("2026-12-20");
    expect(dataDaCotacao("10/12/2026", hoje)).toBe(hoje);
  });
  it("validade em dias ou data", () => {
    expect(validadeDaCotacao("Validade: 10 dias", "2026-11-20")).toBe("2026-11-30");
    expect(validadeDaCotacao("30 dias", "2026-11-20")).toBe("2026-12-20");
    expect(validadeDaCotacao("válida até 15/12/2026", "2026-11-20")).toBe("2026-12-15");
    expect(validadeDaCotacao("até 05/01", "2026-11-20")).toBe("2027-01-05");
    expect(validadeDaCotacao("", "2026-11-20")).toBeNull();
    expect(validadeDaCotacao("enquanto durar o estoque", "2026-11-20")).toBeNull();
  });
  it("idade", () => {
    expect(idadeDaCotacao(hoje, hoje)).toBe("hoje");
    expect(idadeDaCotacao("2026-11-23", hoje)).toBe("ontem");
    expect(idadeDaCotacao("2026-11-04", hoje)).toBe("há 20 dias");
    expect(idadeDaCotacao("2026-08-24", hoje)).toBe("há 3 meses");
    expect(idadeDaCotacao("2025-05-24", hoje)).toBe("há 1 ano e 6 meses");
  });
});

describe("itens, título e fornecedor", () => {
  it("itens como vieram, em centavos; sem descrição não entra", () => {
    expect(
      itensDaExtracao([
        { descricao: "  Piso emborrachado   15mm 50x50 ", unidade: "m²", quantidade: 120, precoUnitario: 89.9, total: 10788 },
        { descricao: "", precoUnitario: 10 },
        { descricao: "Cola", precoUnitario: -1, quantidade: 0 },
      ]),
    ).toEqual([
      { descricao: "Piso emborrachado 15mm 50x50", unidade: "m²", quantidade: 120, precoUnitarioCentavos: 8990, totalCentavos: 1078800, observacao: null },
      { descricao: "Cola", unidade: null, quantidade: null, precoUnitarioCentavos: null, totalCentavos: null, observacao: null },
    ]);
  });
  it("nome fácil", () => {
    expect(tituloDaCotacao("Borrachas Sul", "Piso emborrachado 15 e 20mm", [], hoje)).toBe("Borrachas Sul · Piso emborrachado 15 e 20mm · nov/2026");
    expect(tituloDaCotacao("X", null, [{ descricao: "Piso 15mm" }, { descricao: "Cola" }], "2027-01-05")).toBe("X · Piso 15mm e mais 1 · jan/2027");
  });
  it("mesmo fornecedor com Ltda, Comércio, acento", () => {
    expect(nomeDeEmpresaComparavel("Borrachas Sul Indústria e Comércio Ltda.")).toBe("borrachas sul");
    expect(mesmoFornecedor("BORRACHAS SUL LTDA", "Borrachas Sul")).toBe(true);
    expect(mesmoFornecedor("Madeireira São José", "Madeireira Sao Jose ME")).toBe(true);
    expect(mesmoFornecedor("Casa do Piso", "Casa do Parafuso")).toBe(false);
    expect(mesmoFornecedor("Sul", "Borrachas Sul")).toBe(false);
  });
});

describe("busca por produto", () => {
  it("normaliza medidas e acentos", () => {
    expect(normalizarBusca("Piso Emborrachado 15 MM – 50 x 50 (m²)")).toBe("piso emborrachado 15mm 50x50 m2");
    expect(normalizarBusca("Tubo 1,5 pol.")).toBe("tubo 1,5pol");
  });
  it("palavra com o fim cortado e medida exata", () => {
    expect(pontosDoTermo("piso emborrachado 15mm", "PISO EMBORRACHADA 15 mm preto")).toBe(1);
    expect(pontosDoTermo("piso emborrachado 15mm", "Piso de borracha 15mm")).toBeCloseTo(2 / 3);
    expect(pontosDoTermo("piso emborrachado 15mm", "Piso emborrachado 20mm")).toBe(0);
    expect(pontosDoTermo("piso emborrachado 15mm", "Piso emborrachado 150mm")).toBe(0);
    expect(pontosDoTermo("pisos", "Piso")).toBe(1);
    expect(pontosDoTermo("de para", "qualquer")).toBe(0);
  });
  it("variações do pedido: vale a melhor; ordena do mais parecido", () => {
    const itens = [
      { id: 1, descricao: "Piso vinílico 15mm" },
      { id: 2, descricao: "Piso de borracha 15 mm 50x50" },
      { id: 3, descricao: "Cola de contato" },
      { id: 4, descricao: "Piso emborrachado 20mm" },
    ];
    expect(itensQueCombinam(["piso emborrachado 15mm"], itens).map((r) => r.item.id)).toEqual([1, 2]);
    expect(itensQueCombinam(["piso emborrachado 15mm", "piso borracha 15mm"], itens).map((r) => r.item.id)).toEqual([2, 1]);
    expect(itensQueCombinam([" "], itens)).toEqual([]);
  });
});

describe("mensagem e botão", () => {
  const item = { descricao: "Piso emborrachado 15mm", unidade: "m²", quantidade: 120, precoUnitarioCentavos: 8990, totalCentavos: 1078800, observacao: null };
  it("preço do item", () => {
    expect(precoDoItem(item)).toBe("R$ 89,90/m² · 120 m² = R$ 10.788,00");
    expect(precoDoItem({ ...item, quantidade: null, totalCentavos: null })).toBe("R$ 89,90/m²");
    expect(precoDoItem({ unidade: null, quantidade: null, precoUnitarioCentavos: null, totalCentavos: null })).toBe("sem preço");
  });
  it("resumo do que foi salvo", () => {
    const m = mensagemCotacaoSalva(
      {
        numero: 12,
        titulo: "Borrachas Sul · Piso emborrachado 15mm · nov/2026",
        fornecedorNome: "Borrachas Sul",
        fornecedorNovo: true,
        data: hoje,
        validade: "2026-12-04",
        itens: [item],
        totalCentavos: 1078800,
        frete: "FOB",
        prazoEntrega: "15 dias",
        pagamento: null,
        impostos: "IPI incluso",
        observacoes: null,
        negocio: "Playground Arco-Íris",
        arquivos: 1,
      },
      { avisos: ["Não achei a obra X."] },
    );
    expect(m).toContain("✅ Cotação de fornecedor salva — nº 12");
    expect(m).toContain("🏭 Fornecedor: Borrachas Sul (novo no cadastro de Fornecedores)");
    expect(m).toContain("📅 24/11/2026 · válida até 04/12/2026");
    expect(m).toContain("1. Piso emborrachado 15mm — R$ 89,90/m² · 120 m² = R$ 10.788,00");
    expect(m).toContain("🚚 Frete: FOB · ⏱️ Prazo: 15 dias · 🧾 IPI incluso");
    expect(m).toContain("🏗️ Obra: Playground Arco-Íris");
    expect(m).toContain("⚠️ Não achei a obra X.");
    // Não pode parecer resumo de despesa (a trava do agente forçaria registrar_despesa).
    expect(/para confirmar|confirme na enquete|✅ registrad|corrigi, confere|💸/i.test(m)).toBe(false);
  });
  it("botão apagar", () => {
    const id = "cmi3x9k2p0000abcd1234efgh";
    expect(lerBotao(botoesCotacaoSalva(id)[0][0].dados)).toEqual({ tipo: "cotacao-apagar", cotacaoId: id });
  });
});
