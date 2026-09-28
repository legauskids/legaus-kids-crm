import { test } from "node:test";
import assert from "node:assert/strict";
import { mencionaAlguemDaEquipe, motivoParaNaoSerComando } from "./regras-comando.js";

test("menção à equipe em qualquer lugar do texto, sem diferenciar maiúscula", () => {
  assert.equal(mencionaAlguemDaEquipe("@dani o cliente da Escola X pediu orçamento"), true);
  assert.equal(mencionaAlguemDaEquipe("Liga pra ele amanhã @Marcos"), true);
  assert.equal(mencionaAlguemDaEquipe("@DANIELA, viu isso?"), true);
  assert.equal(mencionaAlguemDaEquipe("oi\n@marcos: segue o pedido"), true);
});

test("não confunde com e-mail, nome maior ou texto sem @", () => {
  assert.equal(mencionaAlguemDaEquipe("manda pra contato@dani.com.br"), false);
  assert.equal(mencionaAlguemDaEquipe("fala com o @danilo"), false);
  assert.equal(mencionaAlguemDaEquipe("cria um orçamento pro Marcos da escola"), false);
  assert.equal(mencionaAlguemDaEquipe(null), false);
});

test("mensagem que sai da Legaus só é comando no 'Mensagens para mim'", () => {
  assert.match(motivoParaNaoSerComando({ fromMe: true, conversaPropria: false, texto: "resumo dos leads de hoje" }), /saiu do número/);
  assert.equal(motivoParaNaoSerComando({ fromMe: true, conversaPropria: true, texto: "resumo dos leads de hoje" }), null);
});

test("mensagem recebida é comando, a não ser que mencione alguém da equipe", () => {
  assert.equal(motivoParaNaoSerComando({ fromMe: false, conversaPropria: false, texto: "cria tarefa pra ligar pro João" }), null);
  assert.match(motivoParaNaoSerComando({ fromMe: false, conversaPropria: false, texto: "@dani liga pro João" }), /menciona/);
  // Nota de voz: sem texto pra checar — segue as outras regras.
  assert.equal(motivoParaNaoSerComando({ fromMe: false, conversaPropria: false, texto: null }), null);
});

test("recado com @ também vale no 'Mensagens para mim'", () => {
  assert.match(motivoParaNaoSerComando({ fromMe: true, conversaPropria: true, texto: "@marcos lembrar do boleto" }), /menciona/);
});
