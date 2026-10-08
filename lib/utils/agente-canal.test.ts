import { describe, expect, it } from "vitest";
import { canalDoIdentificador, dividirMensagem, emLinhas, lerBotao, paraHtmlTelegram, LIMITE_DADOS_BOTAO } from "./agente-canal";

const DESPESA = "cmuyh8fgw0005l4061bgakzdi";

describe("canalDoIdentificador", () => {
  it("telefone, Telegram e chat do CRM", () => {
    expect(canalDoIdentificador("5555999603257")).toBe("whatsapp");
    expect(canalDoIdentificador("tg:7366553763")).toBe("telegram");
    expect(canalDoIdentificador("crm:cmt4lzj590001uby4pvplg0f5")).toBe("crm");
  });
});

describe("lerBotao", () => {
  it("ações de despesa", () => {
    expect(lerBotao(`d:ok:${DESPESA}`)).toEqual({ tipo: "despesa", acao: "ok", despesaId: DESPESA });
    expect(lerBotao(`d:u:${DESPESA}`)).toEqual({ tipo: "despesa", acao: "u", despesaId: DESPESA });
    expect(lerBotao(`d:zz:${DESPESA}`)).toBeNull();
  });
  it("categoria, centro, juntar, pendente e aviso", () => {
    expect(lerBotao(`dc:${DESPESA}:eb6e0dd0`)).toEqual({ tipo: "categoria", despesaId: DESPESA, prefixo: "eb6e0dd0" });
    expect(lerBotao(`dg:${DESPESA}:cg-administrativo`)).toEqual({ tipo: "centro", despesaId: DESPESA, centroGeralId: "cg-administrativo" });
    expect(lerBotao(`dj:${DESPESA}:${DESPESA}`)).toMatchObject({ tipo: "juntar" });
    expect(lerBotao(`ca:${DESPESA}`)).toEqual({ tipo: "pendente", confirmar: true, comandoId: DESPESA });
    expect(lerBotao(`cx:${DESPESA}`)).toEqual({ tipo: "pendente", confirmar: false, comandoId: DESPESA });
    expect(lerBotao(`an:${DESPESA}:${DESPESA}`)).toMatchObject({ tipo: "aviso-negocio" });
    expect(lerBotao(`ax:${DESPESA}`)).toMatchObject({ tipo: "aviso-ignorar" });
  });
  it("lixo ou partes a mais não viram pedido", () => {
    expect(lerBotao(null)).toBeNull();
    expect(lerBotao("")).toBeNull();
    expect(lerBotao(`ca:${DESPESA}:extra`)).toBeNull();
    expect(lerBotao("d:ok:id com espaço")).toBeNull();
  });
  it("todos os formatos cabem no limite do Telegram", () => {
    for (const d of [`dc:${DESPESA}:eb6e0dd0`, `dg:${DESPESA}:cg-administrativo`, `dj:${DESPESA}:${DESPESA}`, `an:${DESPESA}:${DESPESA}`]) {
      expect(Buffer.byteLength(d)).toBeLessThanOrEqual(LIMITE_DADOS_BOTAO);
    }
  });
});

describe("paraHtmlTelegram", () => {
  it("negrito e itálico do estilo WhatsApp viram HTML", () => {
    expect(paraHtmlTelegram("💸 *R$ 66,00* — Posto\n🏷️ Categoria: Alimentação _(deduzida)_")).toBe("💸 <b>R$ 66,00</b> — Posto\n🏷️ Categoria: Alimentação <i>(deduzida)</i>");
  });
  it("escapa < > & e não mexe em nome_de_arquivo nem conta", () => {
    expect(paraHtmlTelegram("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
    expect(paraHtmlTelegram("arquivo_final_v2.pdf e 2*3*4")).toBe("arquivo_final_v2.pdf e 2*3*4");
  });
});

describe("dividirMensagem e emLinhas", () => {
  it("quebra mensagem longa sem perder texto", () => {
    const texto = Array.from({ length: 300 }, (_, i) => `linha ${i} ${"x".repeat(20)}`).join("\n");
    const partes = dividirMensagem(texto, 1000);
    expect(partes.every((p) => p.length <= 1000)).toBe(true);
    expect(partes.join("\n")).toBe(texto);
    expect(dividirMensagem("curta")).toEqual(["curta"]);
  });
  it("botões em linhas", () => {
    const b = [1, 2, 3].map((n) => ({ texto: String(n), dados: String(n) }));
    expect(emLinhas(b, 2).map((l) => l.length)).toEqual([2, 1]);
  });
});
