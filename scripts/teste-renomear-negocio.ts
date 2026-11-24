// Renomear negócio (2026-11-24), no banco: venda e pós-venda do mesmo
// projeto mudam juntos, o de outro cliente com o mesmo nome não, a troca
// fica no histórico, título vazio é recusado. Apaga tudo o que cria.
// Rodar:
// node --dns-result-order=ipv4first node_modules/tsx/dist/cli.mjs --conditions=react-server --env-file=.env scripts/teste-renomear-negocio.ts
import { prisma } from "@/lib/db";
import { renomearNegocio } from "@/lib/server/negocios";
import { SUFIXO_POS_VENDA } from "@/lib/utils/negocio-pos-venda";

const MARCA = `TESTE-RN-${Date.now()}`;
let falhas = 0;
const ok = (c: unknown, m: string) => {
  console.log(`${c ? "ok  " : "FALHOU"} ${m}`);
  if (!c) falhas++;
};

async function main() {
  const marcos = await prisma.user.findFirstOrThrow({ where: { isAdmin: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
  const venda = await prisma.funil.findFirstOrThrow({ where: { nome: "Funil de venda" }, include: { etapas: { orderBy: { ordem: "asc" }, take: 1 } } });
  const posVenda = await prisma.funil.findFirstOrThrow({ where: { nome: "Funil de pós-venda" }, include: { etapas: { orderBy: { ordem: "asc" }, take: 1 } } });
  const antes = { negocios: await prisma.negocio.count(), atividades: await prisma.atividade.count() };
  console.log("antes:", antes);
  const contatos: string[] = [];
  const negocios: string[] = [];
  const contato = async (nome: string) => {
    const c = await prisma.contato.create({ data: { nome: `${MARCA} ${nome}` } });
    contatos.push(c.id);
    return c.id;
  };
  const negocio = async (titulo: string, contatoId: string, posVendaFunil = false) => {
    const funil = posVendaFunil ? posVenda : venda;
    const n = await prisma.negocio.create({ data: { titulo, contatoId, funilId: funil.id, etapaId: funil.etapas[0].id, responsavelId: marcos.id } });
    negocios.push(n.id);
    return n.id;
  };
  const titulo = async (id: string) => (await prisma.negocio.findUniqueOrThrow({ where: { id }, select: { titulo: true } })).titulo;

  try {
    const escola = await contato("Escola");
    const outraEscola = await contato("Outra escola");
    const base = `${MARCA} Playground`;
    const v = await negocio(base, escola);
    const p = await negocio(`${base}${SUFIXO_POS_VENDA}`, escola, true);
    const outro = await negocio(`${base}${SUFIXO_POS_VENDA}`, outraEscola, true);

    // 1. Renomear a venda: o pós-venda do mesmo cliente acompanha
    const r1 = await renomearNegocio(v, `  ${MARCA}   Playground Arco-Íris `);
    ok(r1.titulo === `${MARCA} Playground Arco-Íris` && (await titulo(v)) === r1.titulo, `venda renomeada (espaços limpos): ${r1.titulo}`);
    ok((await titulo(p)) === `${MARCA} Playground Arco-Íris${SUFIXO_POS_VENDA}` && r1.gemeos.map((g) => g.id).join() === p, "pós-venda acompanhou, com o sufixo");
    ok((await titulo(outro)) === `${base}${SUFIXO_POS_VENDA}`, "pós-venda de outro cliente com o mesmo nome não mudou");
    const hist = await prisma.atividade.findMany({ where: { negocioId: { in: [v, p] } }, orderBy: { criadoEm: "asc" }, select: { negocioId: true, texto: true } });
    ok(
      hist.find((h) => h.negocioId === v)?.texto === `Título alterado de “${base}” para “${MARCA} Playground Arco-Íris”.` &&
        hist.find((h) => h.negocioId === p)?.texto.startsWith("Título alterado junto com o negócio de venda:"),
      "troca no histórico dos dois",
    );

    // 2. Renomear o pós-venda sem o sufixo: o sufixo fica, a venda acompanha
    const r2 = await renomearNegocio(p, `${MARCA} Playground Escola Arco-Íris`);
    ok(r2.titulo === `${MARCA} Playground Escola Arco-Íris${SUFIXO_POS_VENDA}` && (await titulo(p)) === r2.titulo, "pós-venda: o sufixo continua");
    ok((await titulo(v)) === `${MARCA} Playground Escola Arco-Íris` && r2.gemeos[0]?.id === v, "venda acompanhou, sem o sufixo");

    // 3. Mesmo título: nada muda, nada no histórico
    const qtd = await prisma.atividade.count({ where: { negocioId: { in: [v, p] } } });
    const r3 = await renomearNegocio(v, `${MARCA} Playground Escola Arco-Íris`);
    ok(r3.gemeos.length === 0 && (await prisma.atividade.count({ where: { negocioId: { in: [v, p] } } })) === qtd, "mesmo título: não registra nada");

    // 4. Título vazio ou só o sufixo é recusado; longo demais também
    for (const vazio of ["   ", SUFIXO_POS_VENDA]) {
      const erro = await renomearNegocio(p, vazio).then(
        () => null,
        (e: Error) => e.message,
      );
      ok(erro === "Informe um título.", `recusa "${vazio.trim() || "vazio"}"`);
    }
    const longo = await renomearNegocio(v, "x".repeat(201)).then(
      () => null,
      (e: Error) => e.message,
    );
    ok(longo?.startsWith("Título muito longo"), "recusa título longo demais");
    ok((await titulo(v)) === `${MARCA} Playground Escola Arco-Íris`, "recusado não muda nada");

    // 5. Negócio sem par: só ele muda
    const sozinho = await negocio(`${MARCA} Manutenção`, escola);
    const r5 = await renomearNegocio(sozinho, `${MARCA} Manutenção FEMA`);
    ok(r5.gemeos.length === 0 && (await titulo(sozinho)) === `${MARCA} Manutenção FEMA`, "sem pós-venda: só ele");
  } finally {
    const atividades = await prisma.atividade.deleteMany({ where: { negocioId: { in: negocios } } });
    await prisma.negocio.deleteMany({ where: { id: { in: negocios } } });
    await prisma.contato.deleteMany({ where: { id: { in: contatos } } });
    const depois = { negocios: await prisma.negocio.count(), atividades: await prisma.atividade.count() };
    console.log(`limpeza: ${negocios.length} negócios, ${atividades.count} atividades, ${contatos.length} contatos; depois:`, depois);
    ok(depois.negocios === antes.negocios && depois.atividades === antes.atividades, "contagens voltaram ao que eram");
    console.log(falhas ? `${falhas} FALHA(S)` : "TUDO OK");
    await prisma.$disconnect();
  }
}
void main();
