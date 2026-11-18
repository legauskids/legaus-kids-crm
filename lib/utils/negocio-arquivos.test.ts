import { describe, expect, it, vi } from "vitest";
import {
  PARTE_ARQUIVO_NEGOCIO,
  abreNoNavegador,
  contentDisposition,
  enviarEmPartes,
  mimeSeguro,
  nomeArquivoSeguro,
  problemaDoArquivo,
  tamanhoDaParte,
  tamanhoLegivel,
  totalDePartes,
} from "./negocio-arquivos";

const MB = 1024 * 1024;

describe("partes do arquivo (pedido de 2026-11-18)", () => {
  it("divide em partes de 3 MB, a última com o resto", () => {
    expect(PARTE_ARQUIVO_NEGOCIO).toBe(3 * MB);
    expect(totalDePartes(1)).toBe(1);
    expect(totalDePartes(3 * MB)).toBe(1);
    expect(totalDePartes(3 * MB + 1)).toBe(2);
    expect(totalDePartes(50 * MB)).toBe(17);
    expect(tamanhoDaParte(7 * MB, 0)).toBe(3 * MB);
    expect(tamanhoDaParte(7 * MB, 2)).toBe(MB);
    expect(tamanhoDaParte(500, 0)).toBe(500);
  });
  it("índice fora do arquivo não tem tamanho", () => {
    expect(tamanhoDaParte(7 * MB, 3)).toBe(0);
    expect(tamanhoDaParte(7 * MB, -1)).toBe(0);
    expect(tamanhoDaParte(7 * MB, 0.5)).toBe(0);
  });
  it("aceita de 1 byte até 50 MB", () => {
    expect(problemaDoArquivo(1)).toBeNull();
    expect(problemaDoArquivo(50 * MB)).toBeNull();
    expect(problemaDoArquivo(0)).toBe("está vazio");
    expect(problemaDoArquivo(50 * MB + 1)).toBe("passa de 50 MB");
  });
});

describe("nome, tipo e tamanho", () => {
  it("tira pasta e caracteres de controle e preserva a extensão", () => {
    expect(nomeArquivoSeguro("C:\\fotos\\obra.jpg")).toBe("obra.jpg");
    expect(nomeArquivoSeguro("../a\u0000b.pdf")).toBe("ab.pdf");
    expect(nomeArquivoSeguro("   ")).toBe("arquivo");
    const longo = nomeArquivoSeguro(`${"x".repeat(300)}.dwg`);
    expect(longo).toHaveLength(200);
    expect(longo.endsWith(".dwg")).toBe(true);
  });
  it("tipo estranho vira octet-stream", () => {
    expect(mimeSeguro("Application/PDF")).toBe("application/pdf");
    expect(mimeSeguro("")).toBe("application/octet-stream");
    expect(mimeSeguro("text/html\r\nX: y")).toBe("application/octet-stream");
  });
  it("só abre no navegador o que não roda código", () => {
    expect(abreNoNavegador("application/pdf")).toBe(true);
    expect(abreNoNavegador("image/jpeg")).toBe(true);
    expect(abreNoNavegador("video/mp4")).toBe(true);
    expect(abreNoNavegador("text/html")).toBe(false);
    expect(abreNoNavegador("image/svg+xml")).toBe(false);
    expect(abreNoNavegador("application/zip")).toBe(false);
  });
  it("tamanho legível", () => {
    expect(tamanhoLegivel(900)).toBe("900 B");
    expect(tamanhoLegivel(250 * 1024)).toBe("250 KB");
    expect(tamanhoLegivel(2.34 * MB)).toBe("2,3 MB");
    expect(tamanhoLegivel(12 * MB)).toBe("12 MB");
  });
  it("Content-Disposition com acento e reserva ASCII", () => {
    expect(contentDisposition("Orçamento (final).pdf", true)).toBe(
      `inline; filename="Orcamento (final).pdf"; filename*=UTF-8''Or%C3%A7amento%20%28final%29.pdf`,
    );
    expect(contentDisposition('a"b.zip', false)).toBe(`attachment; filename="a_b.zip"; filename*=UTF-8''a%22b.zip`);
  });
});

describe("enviarEmPartes", () => {
  const arquivo = (bytes: number) => new File([new Uint8Array(bytes)], "planta.dwg", { type: "" });

  it("manda as partes em ordem e informa o progresso", async () => {
    const partes: [number, number][] = [];
    const progresso = vi.fn();
    const r = await enviarEmPartes(
      arquivo(7 * MB),
      {
        iniciar: async (meta) => {
          expect(meta).toEqual({ nome: "planta.dwg", mime: "", tamanho: 7 * MB });
          return { id: "a1" };
        },
        enviarParte: async (id, indice, parte) => {
          expect(id).toBe("a1");
          partes.push([indice, parte.size]);
          return { ok: true };
        },
      },
      progresso,
    );
    expect(r).toEqual({ id: "a1" });
    expect(partes).toEqual([
      [0, 3 * MB],
      [1, 3 * MB],
      [2, MB],
    ]);
    expect(progresso.mock.calls.map((c) => c[0])).toEqual([3 * MB, 6 * MB, 7 * MB]);
  });

  it("tenta a parte de novo quando a internet falha uma vez", async () => {
    let falhou = false;
    const r = await enviarEmPartes(arquivo(10), {
      iniciar: async () => ({ id: "a1" }),
      enviarParte: async () => {
        if (!falhou) {
          falhou = true;
          throw new TypeError("Failed to fetch");
        }
        return { ok: true };
      },
    });
    expect(r).toEqual({ id: "a1" });
  });

  it("para no primeiro erro", async () => {
    const enviarParte = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const r = await enviarEmPartes(arquivo(10), { iniciar: async () => ({ id: "a1" }), enviarParte });
    expect(r).toEqual({ error: "Não foi possível enviar agora — confira a internet e tente de novo." });
    expect(enviarParte).toHaveBeenCalledTimes(2);

    const recusado = await enviarEmPartes(arquivo(10), { iniciar: async () => ({ error: "Negócio não encontrado." }), enviarParte });
    expect(recusado).toEqual({ error: "Negócio não encontrado." });
  });
});
