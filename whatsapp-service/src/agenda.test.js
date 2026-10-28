import { test } from "node:test";
import assert from "node:assert/strict";

// crm-api.js encerra o processo sem token — o teste só usa a parte pura.
process.env.CRM_API_TOKEN ||= "teste";
const { nomesDoEvento } = await import("./agenda.js");

const lids = { "123456789012345@lid": "555599446076" };
const resolverLid = (lid) => lids[lid] ?? null;

test("contato salvo na agenda pelo número (contactAction)", () => {
  assert.deepEqual(nomesDoEvento([{ id: "555599446076@s.whatsapp.net", name: "  Monique   Girua ", phoneNumber: "555599446076@s.whatsapp.net" }], resolverLid), [
    { telefone: "555599446076", nome: "Monique Girua" },
  ]);
});

test("contato salvo pelo LID usa o telefone do phoneNumber ou do lid-cache", () => {
  assert.deepEqual(nomesDoEvento([{ id: "999@lid", name: "Ana", phoneNumber: "5554996960296@s.whatsapp.net" }], resolverLid), [{ telefone: "5554996960296", nome: "Ana" }]);
  assert.deepEqual(nomesDoEvento([{ id: "123456789012345@lid", name: "Escola X" }], resolverLid), [{ telefone: "555599446076", nome: "Escola X" }]);
});

test("sem nome, LID desconhecido, grupo ou número curto ficam de fora", () => {
  assert.deepEqual(
    nomesDoEvento(
      [
        { id: "555599446076@s.whatsapp.net", name: "   " },
        { id: "555599446076@s.whatsapp.net", notify: "Perfil" },
        { id: "777@lid", name: "Sem telefone" },
        { id: "120363000000000000@g.us", name: "Grupo" },
        { id: "12345@s.whatsapp.net", name: "Curto" },
      ],
      resolverLid,
    ),
    [],
  );
  assert.deepEqual(nomesDoEvento(undefined, resolverLid), []);
});
