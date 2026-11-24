// Avisos das contas a pagar (2026-11-24, etapa 3), no banco, sem mandar nada:
// botão "Já paguei" (pagar, ligar a um pagamento já registrado, desfazer,
// permissão) e o aviso das 8h e das 17h com destinos de teste (uma vez por
// dia e canal, nova tentativa quando falha). Apaga tudo o que cria.
// Rodar:
// node --dns-result-order=ipv4first node_modules/tsx/dist/cli.mjs --conditions=react-server --env-file=.env scripts/teste-avisos-contas.ts
import { prisma } from "@/lib/db";
import { processarBotaoAgente } from "@/lib/server/agente";
import { criarContaPagar } from "@/lib/server/contas-pagar";
import { rodarAvisosDeContas, type DestinoAviso } from "@/lib/server/aviso-contas";
import { diaBrasilia, somarDias } from "@/lib/utils/brasilia";
import { dataDaDespesa } from "@/lib/utils/despesas";

// Nada sai pela rede (Telegram/WhatsApp).
globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, result: {} }))) as typeof fetch;

const MARCA = `TESTE-AV-${Date.now()}`;
const tg = `tg:${MARCA}`;
let falhas = 0;
const ok = (c: unknown, m: string) => {
  console.log(`${c ? "ok  " : "FALHOU"} ${m}`);
  if (!c) falhas++;
};
const dados = (b: { dados: string }[][] | undefined) => (b ?? []).flat().map((x) => x.dados);
// Valor que nenhuma despesa de verdade tem (o "Já paguei" procura pagamentos com o mesmo valor).
const valor = 9_000_000 + (Date.now() % 99_991);

async function main() {
  const marcos = await prisma.user.findFirstOrThrow({ where: { isAdmin: true, telegramId: { not: null } }, select: { id: true } });
  const categoria = await prisma.centroCusto.findFirstOrThrow({ where: { tipo: "DESPESA", ativo: true }, orderBy: { ordem: "asc" }, select: { id: true } });
  const centro = await prisma.centroGeral.findFirstOrThrow({ where: { ativo: true }, select: { id: true } });
  const hoje = diaBrasilia(new Date());
  const antes = { contas: await prisma.contaPagar.count(), despesas: await prisma.despesa.count() };
  console.log("antes:", antes);
  const base = { categoriaId: categoria.id, centroGeralId: centro.id, negocioId: null, repeticao: "UNICA" as const, registradaPorId: marcos.id };
  const nova = async (fornecedor: string, vencimento: string, valorCentavos = valor) => {
    await criarContaPagar({ ...base, fornecedor: `${MARCA} ${fornecedor}`, vencimento, valorCentavos });
    return prisma.contaPagar.findFirstOrThrow({ where: { fornecedor: `${MARCA} ${fornecedor}` } });
  };
  const botao = (d: string, usuarioId = marcos.id) => processarBotaoAgente({ identificador: tg, usuarioId, dados: d });

  try {
    // 1. Já paguei sem pagamento registrado: paga hoje e cria a despesa
    const conta = await nova("RGE", hoje);
    const r1 = await botao(`jp:${conta.id}`);
    let c = await prisma.contaPagar.findUniqueOrThrow({ where: { id: conta.id }, include: { despesa: true } });
    ok(c.status === "PAGA" && c.despesaCriada && c.despesa?.status === "AGUARDANDO_CONCILIACAO" && diaBrasilia(c.despesa.data) === hoje, "Já paguei: paga hoje, despesa aguardando o extrato");
    ok(c.despesa?.categoriaId === categoria.id && c.despesa?.centroGeralId === centro.id, "despesa com a categoria e o centro da conta");
    ok(r1?.resposta.includes("marcada como paga hoje") && dados(r1?.botoes).join() === `ju:${conta.id}`, "resposta com Desfazer");
    ok((await botao(`jp:${conta.id}`))?.resposta.includes("já estava paga"), "tocar de novo não paga duas vezes");

    // 2. Desfazer: volta a abrir e apaga a despesa criada
    const despesaCriada = c.despesaId!;
    const r2 = await botao(`ju:${conta.id}`);
    c = await prisma.contaPagar.findUniqueOrThrow({ where: { id: conta.id }, include: { despesa: true } });
    ok(c.status === "ABERTA" && !c.despesaId && !(await prisma.despesa.findUnique({ where: { id: despesaCriada } })), "Desfazer: em aberto, despesa apagada");
    ok(r2?.resposta.includes("voltou para em aberto"), "resposta do Desfazer");
    ok((await botao(`ju:${conta.id}`))?.resposta.includes("já está em aberto"), "Desfazer de novo não quebra");

    // 3. Já existe pagamento com o valor (ex.: push do banco): pergunta, liga sem duplicar
    const pix = await prisma.despesa.create({
      data: { data: dataDaDespesa(somarDias(hoje, -1)), valorCentavos: valor, fornecedor: `${MARCA} PIX RGE`, status: "AGUARDANDO_CONCILIACAO", origem: "MANUAL", registradaPorId: marcos.id, categoriaId: categoria.id, centroGeralId: centro.id },
    });
    const r3 = await botao(`jp:${conta.id}`);
    ok(r3?.resposta.includes("Já tem um pagamento registrado") && dados(r3?.botoes).join() === `jl:${conta.id}:${pix.id},jh:${conta.id}`, "pergunta se é o pagamento já registrado");
    ok((await prisma.contaPagar.findUniqueOrThrow({ where: { id: conta.id } })).status === "ABERTA", "perguntar não paga");
    const despesasAntes = await prisma.despesa.count();
    const r4 = await botao(`jl:${conta.id}:${pix.id}`);
    c = await prisma.contaPagar.findUniqueOrThrow({ where: { id: conta.id }, include: { despesa: true } });
    ok(c.status === "PAGA" && c.despesaId === pix.id && !c.despesaCriada && (await prisma.despesa.count()) === despesasAntes, "É este: ligada sem criar outra despesa");
    ok(r4?.resposta.includes("pagamento que já estava registrado"), "resposta da ligação");
    await botao(`ju:${conta.id}`);
    ok((await prisma.despesa.findUnique({ where: { id: pix.id } })) !== null, "Desfazer a ligação mantém a despesa que já existia");
    await botao(`jh:${conta.id}`);
    const deHojeNova = await prisma.contaPagar.findUniqueOrThrow({ where: { id: conta.id } });
    ok(deHojeNova.status === "PAGA" && deHojeNova.despesaCriada && deHojeNova.despesaId !== pix.id, "Não, registrar o de hoje: cria a despesa nova");

    // 4. Rascunho, conta que não existe, sem acesso ao Financeiro
    const rascunho = await prisma.contaPagar.create({
      data: { vencimento: dataDaDespesa(hoje), valorCentavos: valor, fornecedor: `${MARCA} Rascunho`, status: "A_CONFIRMAR", origem: "TEXTO", registradaPorId: marcos.id, telefoneOrigem: tg },
    });
    ok((await botao(`jp:${rascunho.id}`))?.resposta.includes("ainda não foi lançada"), "rascunho não é pago pelo botão");
    ok((await botao("jp:naoexiste000000000000000"))?.resposta === "Essa conta não existe mais.", "conta que não existe");
    const semFinanceiro = (await prisma.user.findMany({ where: { isAdmin: false }, select: { id: true, nome: true, permissoes: true } })).find(
      (u) => (u.permissoes as Record<string, unknown> | null)?.financeiro === false,
    );
    if (semFinanceiro) {
      const outra = await nova("Sem acesso", hoje);
      ok((await botao(`jp:${outra.id}`, semFinanceiro.id))?.resposta === "Você não tem acesso ao Financeiro.", `sem o Financeiro (${semFinanceiro.nome}) não paga`);
      ok((await prisma.contaPagar.findUniqueOrThrow({ where: { id: outra.id } })).status === "ABERTA", "e a conta continua em aberto");
    } else console.log("(nenhum usuário sem o Financeiro — pulei o teste de permissão)");

    // 5. Avisos: precisa da tabela AvisoContasPagar (migração 20261124120000)
    const temTabela = await prisma.avisoContasPagar.count().then(
      () => true,
      () => false,
    );
    if (!temTabela) {
      console.log("(tabela AvisoContasPagar ainda não existe — rode de novo depois da migração para testar os avisos)");
      return;
    }
    const atrasada = await nova("Atrasada", somarDias(hoje, -4), 48790);
    const deHoje = await nova("Hoje", hoje, 89000);
    const proxima = await nova("Depois de amanhã", somarDias(hoje, 2), 350000);
    const longe = await nova("Longe", somarDias(hoje, 5), 15000);
    const enviados: { canal: string; mensagem: string; botoes?: { dados: string }[][] }[] = [];
    let quebrar = true;
    const destinos = (quebrarWhatsapp = false): DestinoAviso[] => [
      { canal: `teste-${MARCA}-tg`, tipo: "telegram", enviar: async (a) => void enviados.push({ canal: "tg", ...a }) },
      {
        canal: `teste-${MARCA}-wa`,
        tipo: "whatsapp",
        enviar: async (a) => {
          if (quebrarWhatsapp && quebrar) throw new Error("fila fora do ar (teste)");
          enviados.push({ canal: "wa", ...a });
        },
      },
    ];
    const as = (hora: string) => new Date(`${hoje}T${hora}:00-03:00`);

    ok((await rodarAvisosDeContas(as("12:00"), destinos())).turno === null, "fora das 8h e das 17h não manda");

    const m1 = await rodarAvisosDeContas(as("08:01"), destinos(true));
    const tgManha = enviados.find((e) => e.canal === "tg")?.mensagem ?? "";
    ok(m1.turno === "MANHA" && m1.enviados.length === 1 && m1.falhas.length === 1, `8h: Telegram saiu, WhatsApp falhou (${JSON.stringify(m1)})`);
    ok(tgManha.includes(`(venceu há 4 dias)`) && tgManha.includes(`${MARCA} Atrasada`) && tgManha.includes(`${MARCA} Hoje`) && tgManha.includes(`${MARCA} Depois de amanhã`), "8h: atrasada, hoje e próximos dias");
    ok(!tgManha.includes(`${MARCA} Longe`), "8h: 5 dias à frente fica de fora");
    const botoesManha = dados(enviados.find((e) => e.canal === "tg")?.botoes);
    ok([atrasada, deHoje, proxima].every((x) => botoesManha.includes(`jp:${x.id}`)) && !botoesManha.includes(`jp:${longe.id}`), "8h: Já paguei das três");
    ok((await prisma.avisoContasPagar.count({ where: { canal: `teste-${MARCA}-wa` } })) === 0, "falha não fica registrada (tenta de novo)");

    quebrar = false;
    const m2 = await rodarAvisosDeContas(as("08:02"), destinos(true));
    const waManha = enviados.find((e) => e.canal === "wa");
    ok(m2.enviados.join() === `teste-${MARCA}-wa` && enviados.filter((e) => e.canal === "tg").length === 1, "minuto seguinte: só o WhatsApp, que tinha falhado");
    ok(waManha && !waManha.botoes && waManha.mensagem.includes("Marque como paga no CRM"), "WhatsApp sem botões, aponta o CRM");
    const m3 = await rodarAvisosDeContas(as("09:30"), destinos());
    ok(m3.enviados.length === 0 && enviados.length === 2, "8h já mandado: não repete");

    // Duas chamadas ao mesmo tempo (17h): só uma manda.
    await botao(`jp:${atrasada.id}`); // pagar a atrasada não muda as 17h
    const [t1, t2] = await Promise.all([rodarAvisosDeContas(as("17:00"), destinos()), rodarAvisosDeContas(as("17:00"), destinos())]);
    const tarde = enviados.slice(2);
    ok(t1.turno === "TARDE" && t1.enviados.length + t2.enviados.length === 2 && tarde.length === 2, `17h: uma mensagem por canal mesmo com duas chamadas juntas (${tarde.length})`);
    const tgTarde = tarde.find((e) => e.canal === "tg")?.mensagem ?? "";
    ok(tgTarde.startsWith("⏰ *Ainda em aberto") && tgTarde.includes(`${MARCA} Hoje`) && !tgTarde.includes(`${MARCA} Atrasada`) && !tgTarde.includes(`${MARCA} Depois`), "17h: só as de hoje");

    // Pagou a de hoje: amanhã às 17h ela não aparece mais (simula com o dia de hoje já avisado → nada).
    await botao(`jp:${deHoje.id}`);
    ok((await rodarAvisosDeContas(as("17:45"), destinos())).enviados.length === 0, "17h já mandado: não repete");
  } finally {
    const avisos = await prisma.avisoContasPagar.deleteMany({ where: { canal: { startsWith: `teste-${MARCA}` } } }).catch(() => ({ count: 0 }));
    const contas = await prisma.contaPagar.findMany({ where: { fornecedor: { startsWith: MARCA } }, select: { despesaId: true, despesaCriada: true } });
    const apagadas = await prisma.contaPagar.deleteMany({ where: { fornecedor: { startsWith: MARCA } } });
    const despesas = await prisma.despesa.deleteMany({
      where: { OR: [{ fornecedor: { contains: MARCA } }, { id: { in: contas.map((x) => x.despesaId).filter((d): d is string => Boolean(d)) } }] },
    });
    await prisma.comandoAgente.deleteMany({ where: { identificador: tg } });
    const depois = { contas: await prisma.contaPagar.count(), despesas: await prisma.despesa.count() };
    console.log(`limpeza: ${apagadas.count} contas, ${despesas.count} despesas, ${avisos.count} avisos de teste; depois:`, depois);
    ok(depois.contas === antes.contas && depois.despesas === antes.despesas, "contagens voltaram ao que eram");
    console.log(falhas ? `${falhas} FALHA(S)` : "TUDO OK");
    await prisma.$disconnect();
  }
}
void main();
