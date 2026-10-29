import { describe, expect, it } from "vitest";
import { codificarWav, duracaoDoWav, faixaPedida, inicioMaximo, mmss } from "./musicas-story";

describe("trecho da música", () => {
  it("o trecho de 15 s pode começar até 15 s antes do fim", () => {
    expect(inicioMaximo(200.7)).toBe(185);
    expect(inicioMaximo(10)).toBe(0);
  });
  it("mm:ss", () => {
    expect(mmss(0)).toBe("0:00");
    expect(mmss(185.4)).toBe("3:05");
  });
});

describe("WAV", () => {
  it("codifica estéreo 16 bits e a duração volta certa", () => {
    const taxa = 44100;
    const n = taxa * 2; // 2 s
    const esquerdo = Float32Array.from({ length: n }, (_, i) => Math.sin(i / 10));
    const direito = Float32Array.from({ length: n }, () => 2); // fora da faixa: corta em 1
    const wav = codificarWav([esquerdo, direito], taxa);
    expect(wav.length).toBe(44 + n * 4);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe("RIFF");
    expect(duracaoDoWav(wav)).toBeCloseTo(2, 5);
    const v = new DataView(wav.buffer);
    expect(v.getInt16(44 + 2, true)).toBe(0x7fff); // 1ª amostra do canal direito
  });
  it("não é WAV: null", () => {
    expect(duracaoDoWav(new TextEncoder().encode("ID3 não é wav nenhum"))).toBeNull();
  });
});

describe("faixaPedida (Range)", () => {
  it("sem Range: o arquivo inteiro", () => {
    expect(faixaPedida(null, 1000)).toBeNull();
  });
  it("início-fim, aberto e sufixo", () => {
    expect(faixaPedida("bytes=0-1", 1000)).toEqual({ inicio: 0, fim: 1 });
    expect(faixaPedida("bytes=500-", 1000)).toEqual({ inicio: 500, fim: 999 });
    expect(faixaPedida("bytes=-200", 1000)).toEqual({ inicio: 800, fim: 999 });
    expect(faixaPedida("bytes=900-5000", 1000)).toEqual({ inicio: 900, fim: 999 });
  });
  it("fora do arquivo ou malformado: 416", () => {
    expect(faixaPedida("bytes=1000-", 1000)).toBe("invalida");
    expect(faixaPedida("bytes=5-2", 1000)).toBe("invalida");
    expect(faixaPedida("items=0-1", 1000)).toBe("invalida");
  });
});
