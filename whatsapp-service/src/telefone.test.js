import { test } from "node:test";
import assert from "node:assert/strict";
import { mesmoTelefone, variante9Digito } from "./telefone.js";

test("variante9Digito: tira ou põe o 9 extra do celular brasileiro", () => {
  assert.equal(variante9Digito("5554996960296"), "555496960296");
  assert.equal(variante9Digito("555496960296"), "5554996960296");
  assert.equal(variante9Digito("+55 (54) 99696-0296"), "555496960296");
  // O número errado da Renata (2026-10-14) tem formato de celular: a variante
  // existe como formato — quem diz que não tem conta é o WhatsApp.
  assert.equal(variante9Digito("5554969602960"), "555469602960");
});

test("variante9Digito: fixo, estrangeiro ou número quebrado não tem variante", () => {
  assert.equal(variante9Digito("555433331234"), null); // fixo (começa com 3)
  assert.equal(variante9Digito("14155552671"), null);
});

test("mesmoTelefone continua igual com e sem o 9", () => {
  assert.ok(mesmoTelefone("5555999603257", "555599603257"));
});
