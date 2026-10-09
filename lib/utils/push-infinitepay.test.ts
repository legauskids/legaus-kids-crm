import { describe, expect, it } from "vitest";
import { lerPushInfinitePay } from "./push-infinitepay";

describe("lerPushInfinitePay", () => {
  it("Pix recebido (print do Marcos, 08/10/2026), com o título na primeira linha como o MacroDroid manda", () => {
    const texto = "Pix recebido de R$ 0,01! 💰✅\nVocê recebeu um Pix de MARCOS ZANCAN na sua conta InfinitePay! Clique para conferir seu saldo. 👆";
    expect(lerPushInfinitePay(null, texto)).toEqual({
      direcao: "ENTRADA",
      valorCentavos: 1,
      contraparte: "Marcos Zancan",
      documento: null,
      banco: null,
      mensagem: null,
      dataHora: null,
      meio: "PIX",
    });
  });

  it("título e texto separados, valor com milhar", () => {
    const r = lerPushInfinitePay("Pix recebido de R$ 12.500,00! 💰✅", "Você recebeu um Pix de ESCOLA ARCO-ÍRIS LTDA na sua conta InfinitePay!");
    expect(r).toMatchObject({ direcao: "ENTRADA", valorCentavos: 1250000, contraparte: "Escola Arco-Íris Ltda" });
  });

  it("formatos ainda não vistos: Pix enviado e venda no cartão (leitura tolerante)", () => {
    expect(lerPushInfinitePay("Pix enviado de R$ 50,00", "Você enviou um Pix para Posto Ipiranga.")).toMatchObject({ direcao: "SAIDA", valorCentavos: 5000, contraparte: "Posto Ipiranga" });
    expect(lerPushInfinitePay("Venda aprovada!", "Venda de R$ 1.200,00 no crédito em 3x")).toMatchObject({ direcao: "ENTRADA", valorCentavos: 120000, meio: "OUTRO" });
  });

  it("sem valor ou sem direção não é movimentação", () => {
    expect(lerPushInfinitePay("InfinitePay", "Confira as novidades do app!")).toBeNull();
    expect(lerPushInfinitePay("Seu limite", "Seu limite agora é R$ 5.000,00")).toBeNull();
  });
});
