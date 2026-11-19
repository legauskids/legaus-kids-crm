import { describe, expect, it } from "vitest";
import { nomeArquivoOrcamento, textoEnvioOrcamentoWhatsApp } from "./orcamento-mensagem";

describe("textoEnvioOrcamentoWhatsApp", () => {
  it("número, sem valor e sem link", () => {
    const t = textoEnvioOrcamentoWhatsApp(22);
    expect(t).toContain("*#0022*");
    expect(t).not.toMatch(/R\$/);
    expect(t).not.toMatch(/https?:\/\//);
    expect(t).not.toContain("publico/orcamento");
  });
  it("nome do arquivo", () => {
    expect(nomeArquivoOrcamento(22)).toBe("orcamento-0022.pdf");
  });
});
