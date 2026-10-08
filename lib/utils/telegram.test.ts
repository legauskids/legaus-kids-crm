import { describe, expect, it } from "vitest";
import { idsAutorizados, lerUpdate } from "./telegram";

describe("idsAutorizados", () => {
  it("aceita vírgula, espaço e ponto e vírgula, e ignora o que não é número", () => {
    expect([...idsAutorizados("7366553763, 123;456  abc")]).toEqual(["7366553763", "123", "456"]);
    expect(idsAutorizados(undefined).size).toBe(0);
    expect(idsAutorizados("").size).toBe(0);
  });
});

describe("lerUpdate", () => {
  const de = { id: 7366553763, username: "marcos", first_name: "Marcos" };

  it("texto numa conversa privada", () => {
    const u = lerUpdate({ update_id: 10, message: { message_id: 1, from: de, chat: { id: 7366553763, type: "private" }, text: "olá" } });
    expect(u).toMatchObject({ updateId: 10, fromId: "7366553763", chatId: "7366553763", chatPrivado: true, tipo: "texto", texto: "olá", callbackId: null });
  });

  it("áudio, foto e documento (com legenda)", () => {
    const chat = { id: 1, type: "private" };
    expect(lerUpdate({ update_id: 1, message: { message_id: 1, from: de, chat, voice: {} } })?.tipo).toBe("audio");
    expect(lerUpdate({ update_id: 2, message: { message_id: 2, from: de, chat, photo: [{}], caption: "posto" } })).toMatchObject({ tipo: "foto", texto: "posto" });
    expect(lerUpdate({ update_id: 3, message: { message_id: 3, from: de, chat, document: { mime_type: "application/pdf" } } })?.tipo).toBe("documento");
  });

  it("mensagem de grupo não é conversa privada", () => {
    const u = lerUpdate({ update_id: 4, message: { message_id: 4, from: de, chat: { id: -100, type: "group" }, text: "oi" } });
    expect(u?.chatPrivado).toBe(false);
  });

  it("toque em botão", () => {
    const u = lerUpdate({ update_id: 5, callback_query: { id: "cb1", from: de, message: { chat: { id: 7366553763, type: "private" } }, data: "ok:abc" } });
    expect(u).toMatchObject({ tipo: "botao", texto: "ok:abc", callbackId: "cb1", fromId: "7366553763" });
  });

  it("arquivo: voz, maior foto, documento; e o texto do botão tocado", () => {
    const chat = { id: 1, type: "private" };
    expect(lerUpdate({ update_id: 8, message: { message_id: 8, from: de, chat, voice: { file_id: "v1", file_size: 9 } } })?.arquivo).toEqual({ fileId: "v1", mime: "audio/ogg", nome: null, tamanho: 9 });
    const foto = lerUpdate({ update_id: 9, message: { message_id: 9, from: de, chat, photo: [{ file_id: "p-pequena" }, { file_id: "p-grande" }] } });
    expect(foto?.arquivo).toMatchObject({ fileId: "p-grande", mime: "image/jpeg" });
    const pdf = lerUpdate({ update_id: 10, message: { message_id: 10, from: de, chat, document: { file_id: "d1", mime_type: "application/pdf", file_name: "nota.pdf" } } });
    expect(pdf?.arquivo).toMatchObject({ fileId: "d1", mime: "application/pdf", nome: "nota.pdf" });
    const toque = lerUpdate({
      update_id: 11,
      callback_query: {
        id: "cb2",
        from: de,
        data: "d:ok:abc",
        message: { message_id: 77, chat: { id: 7366553763, type: "private" }, reply_markup: { inline_keyboard: [[{ text: "✅ Confirmar", callback_data: "d:ok:abc" }, { text: "❌ Descartar", callback_data: "d:x:abc" }]] } },
      },
    });
    expect(toque).toMatchObject({ mensagemId: 77, botaoTexto: "✅ Confirmar", arquivo: null });
  });

  it("update sem remetente ou inválido", () => {
    expect(lerUpdate(null)).toBeNull();
    expect(lerUpdate({ update_id: 6 })).toBeNull();
    expect(lerUpdate({ update_id: 7, message: { message_id: 7, chat: { id: 1, type: "channel" } } })).toBeNull();
  });
});
