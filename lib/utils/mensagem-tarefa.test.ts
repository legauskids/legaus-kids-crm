import { describe, expect, it } from "vitest";
import { contatoDaTarefa, mensagemDoFormulario, validarMensagemDaTarefa } from "./mensagem-tarefa";

const agora = new Date("2026-10-26T12:00:00.000Z");
const prazo = new Date("2026-10-27T12:00:00.000Z");

describe("contatoDaTarefa", () => {
  const ana = { id: "ana" };
  const bia = { id: "bia" };
  const caio = { id: "caio" };

  it("vale o contato da tarefa, depois o da conversa, depois o do negócio", () => {
    expect(contatoDaTarefa({ contato: ana, conversa: { contato: bia }, negocio: { contato: caio } })).toBe(ana);
    expect(contatoDaTarefa({ contato: null, conversa: { contato: bia }, negocio: { contato: caio } })).toBe(bia);
    expect(contatoDaTarefa({ contato: null, conversa: null, negocio: { contato: caio } })).toBe(caio);
  });

  it("tarefa avulsa sem contato nem negócio: ninguém", () => {
    expect(contatoDaTarefa({ contato: null, conversa: null, negocio: null })).toBeNull();
    expect(contatoDaTarefa({ negocio: { contato: null } })).toBeNull();
  });
});

describe("validarMensagemDaTarefa", () => {
  it("sem horário escolhido, vai no prazo da tarefa", () => {
    expect(validarMensagemDaTarefa({ texto: "  Oi, tudo bem?  ", quando: null, prazo, agora })).toEqual({ texto: "Oi, tudo bem?", quando: prazo });
  });

  it("horário escolhido vale mais que o prazo", () => {
    const quando = new Date("2026-10-26T15:00:00.000Z");
    expect(validarMensagemDaTarefa({ texto: "Oi", quando, prazo, agora })).toEqual({ texto: "Oi", quando });
  });

  it("recusa mensagem vazia ou longa demais", () => {
    expect(validarMensagemDaTarefa({ texto: "   ", quando: null, prazo, agora })).toEqual({ erro: "Escreva a mensagem." });
    expect(validarMensagemDaTarefa({ texto: "a".repeat(4001), quando: null, prazo, agora })).toHaveProperty("erro");
  });

  it("recusa horário no passado ou em menos de 1 minuto", () => {
    expect(validarMensagemDaTarefa({ texto: "Oi", quando: new Date(agora.getTime() + 30_000), prazo, agora })).toEqual({
      erro: "O horário da mensagem tem que ser daqui a pelo menos 1 minuto.",
    });
    expect(validarMensagemDaTarefa({ texto: "Oi", quando: null, prazo: new Date("2026-10-25T12:00:00.000Z"), agora })).toEqual({
      erro: "O prazo da tarefa já passou — escolha quando enviar a mensagem.",
    });
  });
});

describe("mensagemDoFormulario", () => {
  const form = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };

  it("sem marcar, não há mensagem", () => {
    expect(mensagemDoFormulario(form({ mensagemTexto: "Oi" }))).toBeNull();
  });

  it("lê texto, horário (Brasília) e contato escolhido", () => {
    expect(mensagemDoFormulario(form({ mensagemAtiva: "on", mensagemTexto: "Oi", mensagemQuando: "2026-10-27T09:00", mensagemContatoId: "c1" }))).toEqual({
      texto: "Oi",
      quando: new Date("2026-10-27T12:00:00.000Z"),
      contatoId: "c1",
    });
    expect(mensagemDoFormulario(form({ mensagemAtiva: "on", mensagemTexto: "Oi", mensagemQuando: "" }))).toEqual({ texto: "Oi", quando: null, contatoId: null });
  });

  it("horário quebrado vira erro", () => {
    expect(mensagemDoFormulario(form({ mensagemAtiva: "on", mensagemTexto: "Oi", mensagemQuando: "amanhã" }))).toEqual({ erro: "Data/hora da mensagem inválida." });
  });
});
