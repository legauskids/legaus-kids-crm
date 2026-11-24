import { describe, expect, it } from "vitest";
import { LIMITE_DADOS_BOTAO, lerBotao } from "./agente-canal";
import {
  LINK_CONTAS_PAGAR,
  botaoDesfazerPagamento,
  botoesDeCandidatas,
  limiteDoAviso,
  mensagemCandidatas,
  mensagemContaPaga,
  montarAvisoContas,
  turnoDoMomento,
  type ContaDoAviso,
} from "./aviso-contas";

// cuid de 25 letras, como os ids de verdade.
const ID = "cmi3x9k2p0000abcd1234efgh";
const OUTRO = "cmi3x9k2p0000zzzz9999yyyy";
const hoje = "2026-11-24"; // terça-feira

const conta = (c: Partial<ContaDoAviso> & Pick<ContaDoAviso, "vencimento" | "fornecedor" | "valorCentavos">): ContaDoAviso => ({
  id: ID,
  parcela: null,
  totalParcelas: null,
  ...c,
});

const atrasada = conta({ vencimento: "2026-11-20", fornecedor: "RGE Sul", valorCentavos: 48790 });
const deHoje = conta({ vencimento: hoje, fornecedor: "Unimed", valorCentavos: 89000 });
const quinta = conta({ vencimento: "2026-11-26", fornecedor: "Aluguel", valorCentavos: 350000 });
const sexta = conta({ vencimento: "2026-11-27", fornecedor: "Madeireira", valorCentavos: 10000, parcela: 2, totalParcelas: 3 });
const sabado = conta({ vencimento: "2026-11-28", fornecedor: "Internet", valorCentavos: 15000 });

describe("quando o aviso sai (hora de Brasília)", () => {
  // Brasília = UTC-3.
  const as = (hora: string) => new Date(`${hoje}T${hora}:00-03:00`);
  it("8h até 9h59 e 17h até 18h59", () => {
    expect(turnoDoMomento(as("07:59"))).toBeNull();
    expect(turnoDoMomento(as("08:00"))).toBe("MANHA");
    expect(turnoDoMomento(as("09:59"))).toBe("MANHA");
    expect(turnoDoMomento(as("10:00"))).toBeNull();
    expect(turnoDoMomento(as("16:59"))).toBeNull();
    expect(turnoDoMomento(as("17:00"))).toBe("TARDE");
    expect(turnoDoMomento(as("18:59"))).toBe("TARDE");
    expect(turnoDoMomento(as("19:00"))).toBeNull();
    expect(turnoDoMomento(as("00:30"))).toBeNull();
  });
  it("manhã: até 3 dias à frente; tarde: só hoje", () => {
    expect(limiteDoAviso("MANHA", hoje)).toBe("2026-11-28");
    expect(limiteDoAviso("TARDE", hoje)).toBe("2026-11-25");
  });
});

describe("aviso das 8h", () => {
  const contas = [sexta, deHoje, sabado, atrasada, quinta];

  it("atrasadas, hoje e próximos 3 dias, com total e botões no Telegram", () => {
    const aviso = montarAvisoContas({ turno: "MANHA", hoje, contas, rascunhos: 2, canal: "telegram" })!;
    const m = aviso.mensagem;
    expect(m).toContain("☀️ Bom dia! *Contas a pagar*");
    expect(m).toContain("🔴 *Atrasadas — R$ 487,90*\n• 20/11 — RGE Sul — R$ 487,90 (venceu há 4 dias)");
    expect(m).toContain("📌 *Vence hoje — R$ 890,00*\n• Unimed — R$ 890,00");
    expect(m).toContain("🗓️ *Próximos 3 dias — R$ 3.600,00*\n• qui 26/11 — Aluguel — R$ 3.500,00\n• sex 27/11 — Madeireira (2/3) — R$ 100,00");
    expect(m).not.toContain("Internet");
    expect(m).toContain("Total: *R$ 4.977,90* em 4 contas.");
    expect(m).toContain("📝 2 contas que vieram pelo WhatsApp/Telegram ainda esperam confirmação");
    expect(m).toContain("Toque em *Já paguei*");
    expect(m.endsWith(LINK_CONTAS_PAGAR)).toBe(true);
    // Um botão por conta, na ordem da mensagem.
    expect(aviso.botoes?.map((l) => l[0].texto)).toEqual([
      "✅ Já paguei: RGE Sul · R$ 487,90",
      "✅ Já paguei: Unimed · R$ 890,00",
      "✅ Já paguei: Aluguel · R$ 3.500,00",
      "✅ Já paguei: Madeireira · R$ 100,00",
    ]);
  });

  it("WhatsApp: sem botões, aponta para o CRM", () => {
    const aviso = montarAvisoContas({ turno: "MANHA", hoje, contas, canal: "whatsapp" })!;
    expect(aviso.botoes).toBeUndefined();
    expect(aviso.mensagem).toContain("Pagou? Marque como paga no CRM, em Financeiro → Contas a pagar.");
    expect(aviso.mensagem).not.toContain("📝");
  });

  it("sem nada: não manda; só rascunhos: manda o lembrete, sem botões", () => {
    expect(montarAvisoContas({ turno: "MANHA", hoje, contas: [sabado], canal: "telegram" })).toBeNull();
    const so = montarAvisoContas({ turno: "MANHA", hoje, contas: [], rascunhos: 1, canal: "telegram" })!;
    expect(so.mensagem).toContain("📝 1 conta que veio pelo WhatsApp/Telegram ainda espera confirmação");
    expect(so.mensagem).not.toContain("Total");
    expect(so.botoes).toBeUndefined();
  });

  it("uma conta só: sem linha de total", () => {
    const m = montarAvisoContas({ turno: "MANHA", hoje, contas: [deHoje], canal: "whatsapp" })!.mensagem;
    expect(m).not.toContain("Total");
  });

  it("muitas contas: corta a lista e os botões", () => {
    const muitas = Array.from({ length: 12 }, (_, i) => conta({ id: `${ID.slice(0, 23)}${String(i).padStart(2, "0")}`, vencimento: "2026-11-01", fornecedor: `F${i}`, valorCentavos: 100 }));
    const aviso = montarAvisoContas({ turno: "MANHA", hoje, contas: muitas, canal: "telegram" })!;
    expect(aviso.mensagem).toContain("• … e mais 2");
    expect(aviso.mensagem).toContain("As outras, marque no CRM.");
    expect(aviso.botoes).toHaveLength(8);
  });
});

describe("aviso das 17h", () => {
  it("só as de hoje ainda em aberto", () => {
    const aviso = montarAvisoContas({ turno: "TARDE", hoje, contas: [atrasada, deHoje, quinta], rascunhos: 3, canal: "telegram" })!;
    expect(aviso.mensagem.split("\n").slice(0, 2)).toEqual(["⏰ *Ainda em aberto — vence hoje* (R$ 890,00)", "• Unimed — R$ 890,00"]);
    expect(aviso.mensagem).not.toContain("RGE");
    expect(aviso.mensagem).not.toContain("📝");
    expect(aviso.botoes).toEqual([[{ texto: "✅ Já paguei: Unimed · R$ 890,00", dados: `jp:${ID}` }]]);
  });
  it("nada vencendo hoje: não manda", () => {
    expect(montarAvisoContas({ turno: "TARDE", hoje, contas: [atrasada], rascunhos: 2, canal: "whatsapp" })).toBeNull();
  });
});

describe("Já paguei", () => {
  const candidatas = [{ id: OUTRO, dia: "2026-11-23", fornecedor: "PIX RGE SUL DISTRIBUIDORA DE ENERGIA", valorCentavos: 48790 }];

  it("pagamento já registrado: pergunta antes de ligar", () => {
    expect(mensagemCandidatas(atrasada, candidatas)).toContain("💡 Já tem um pagamento registrado com o valor da conta *RGE Sul* (R$ 487,90):\n• 23/11/2026 — PIX RGE SUL");
    expect(botoesDeCandidatas(ID, candidatas)).toEqual([
      [{ texto: "🔗 É este: 23/11 · PIX RGE SUL DISTRIBUIDO…", dados: `jl:${ID}:${OUTRO}` }],
      [{ texto: "➕ Não, registrar o pagamento de hoje", dados: `jh:${ID}` }],
    ]);
  });
  it("mensagens", () => {
    expect(mensagemContaPaga(sexta, false)).toBe("✅ *Madeireira (2/3)* (R$ 100,00, vencimento 27/11/2026) marcada como paga hoje. A despesa fica aguardando o extrato.");
    expect(mensagemContaPaga(atrasada, true)).toContain("com o pagamento que já estava registrado");
  });
  it("todo botão cabe no Telegram e volta lido", () => {
    const botoes = [
      ...montarAvisoContas({ turno: "MANHA", hoje, contas: [atrasada], canal: "telegram" })!.botoes!,
      ...botoesDeCandidatas(ID, candidatas),
      ...botaoDesfazerPagamento(ID),
    ].flat();
    for (const b of botoes) expect(new TextEncoder().encode(b.dados).length).toBeLessThanOrEqual(LIMITE_DADOS_BOTAO);
    expect(botoes.map((b) => lerBotao(b.dados))).toEqual([
      { tipo: "paguei", acao: "jp", contaId: ID },
      { tipo: "paguei-ligar", contaId: ID, despesaId: OUTRO },
      { tipo: "paguei", acao: "jh", contaId: ID },
      { tipo: "paguei", acao: "ju", contaId: ID },
    ]);
    expect(lerBotao(`jp:${ID}:x`)).toBeNull();
    expect(lerBotao("jl:só-um")).toBeNull();
  });
});
