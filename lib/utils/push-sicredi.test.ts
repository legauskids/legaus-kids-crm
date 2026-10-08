import { describe, expect, it } from "vitest";
import { botoesDeEntrada, lerPushSicredi, negocioDoAviso } from "./push-sicredi";

describe("lerPushSicredi", () => {
  it("Pix enviado, notificação completa (print do Marcos, 07/10/2026)", () => {
    const texto = [
      "Você pagou um Pix no valor de R$ 0,01",
      "Marcos Zancan CPF ###.598.010-##",
      "Banco Cooperativo Sicredi S.a.",
      "07/10/2026 - 10:27:48",
      "Aproveite todas vantagens do Pix no Sicredi.",
    ].join("\n");
    expect(lerPushSicredi("Sicredi Pix", texto)).toEqual({
      direcao: "SAIDA",
      valorCentavos: 1,
      contraparte: "Marcos Zancan",
      documento: "###.598.010-##",
      banco: "Banco Cooperativo Sicredi S.a.",
      dataHora: "2026-10-07T10:27:48",
      meio: "PIX",
    });
  });

  it("valor com milhar e CNPJ", () => {
    const texto = "Você pagou um Pix no valor de R$ 1.839,15\nNC Rotomoldagem Ltda CNPJ ##.123.456/0001-##\nBanco do Brasil S.A.\n05/10/2026 - 08:01:02";
    expect(lerPushSicredi("Sicredi Pix", texto)).toMatchObject({ valorCentavos: 183915, contraparte: "NC Rotomoldagem Ltda", documento: "##.123.456/0001-##", banco: "Banco do Brasil S.A." });
  });

  it("Pix recebido vira entrada", () => {
    const r = lerPushSicredi("Sicredi Pix", "Você recebeu um Pix no valor de R$ 6.500,00\nEscola Arco Iris CNPJ ##.111.222/0001-##\nItaú Unibanco S.A.\n06/10/2026 - 14:00:00");
    expect(r).toMatchObject({ direcao: "ENTRADA", valorCentavos: 650000, contraparte: "Escola Arco Iris" });
  });

  it("só a primeira linha (notificação recolhida): direção e valor, sem o resto", () => {
    expect(lerPushSicredi("Sicredi Pix", "Você pagou um Pix no valor de R$ 66,00")).toEqual({
      direcao: "SAIDA",
      valorCentavos: 6600,
      contraparte: null,
      documento: null,
      banco: null,
      dataHora: null,
      meio: "PIX",
    });
  });

  it("propaganda ou aviso sem movimentação não é lido", () => {
    expect(lerPushSicredi("Sicredi", "Aproveite todas vantagens do Pix no Sicredi.")).toBeNull();
    expect(lerPushSicredi("Sicredi", "Seu limite foi atualizado para R$ 5.000,00")).toBeNull();
  });
});

describe("botoesDeEntrada e negocioDoAviso", () => {
  it("um negócio por linha, título longo cortado, e 'não é de negócio' no fim", () => {
    const b = botoesDeEntrada("av1", [{ id: "n1", titulo: "Playground Escola Arco-Íris" }, { id: "n2", titulo: "x".repeat(60) }]);
    expect(b.map((l) => l[0].dados)).toEqual(["an:av1:n1", "an:av1:n2", "ax:av1"]);
    expect(b[1][0].texto.length).toBe(48);
  });
  it("aviso respondido pré-seleciona o negócio da entrada do extrato", () => {
    const avisos = [
      { negocioId: "longe", valorCentavos: 650000, dia: "2026-10-01" },
      { negocioId: "perto", valorCentavos: 650000, dia: "2026-10-06" },
      { negocioId: "outro-valor", valorCentavos: 100, dia: "2026-10-07" },
    ];
    expect(negocioDoAviso({ dia: "2026-10-07", valorCentavos: 650000, tipo: "ENTRADA" }, avisos)).toBe("perto");
    expect(negocioDoAviso({ dia: "2026-10-20", valorCentavos: 650000, tipo: "ENTRADA" }, avisos)).toBeNull();
    expect(negocioDoAviso({ dia: "2026-10-07", valorCentavos: 650000, tipo: "SAIDA" }, avisos)).toBeNull();
  });
});
