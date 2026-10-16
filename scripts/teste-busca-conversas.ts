// Busca nas conversas do Atendimento pelo agente (pedido de 2026-10-16: "acha
// o contato com final 6980 e gera um negócio..."). Cria um contato de teste
// sem nome (como chega do WhatsApp) com uma conversa, procura pelo final do
// telefone, pelo número inteiro em outro formato, por trecho da mensagem e
// por período; confere o caso real do final 6980 (só leitura). Com --com-ia,
// pede pela IA de verdade (custa alguns centavos) pra achar pelo final e
// criar negócio + tarefa ligados à conversa. Apaga tudo o que cria. Rodar:
// npx tsx --conditions=react-server --env-file=.env scripts/teste-busca-conversas.ts [--com-ia]
import { prisma } from "@/lib/db";
import { buscarConversasAtendimento } from "@/lib/server/busca-conversas";
import { buscarClientesPorFinalTelefone } from "@/lib/server/busca-similar";
import { processarComandoAgente } from "@/lib/server/agente";

let falhas = 0;
const checar = (c: unknown, m: string) => {
  console.log(`${c ? "ok  " : "FALHOU"} ${m}`);
  if (!c) falhas++;
};
// Formato do WhatsApp (sem o 9) — DDD 99 e final improvável.
const TELEFONE = "559987357319";
const FINAL = "57319";
const TG = "tg:990000444";
const COM_IA = process.argv.includes("--com-ia");

async function main() {
  const setor = await prisma.setor.findFirstOrThrow();
  const contato = await prisma.contato.create({ data: { nome: TELEFONE, telefone: TELEFONE } });
  const conversa = await prisma.conversa.create({ data: { contatoId: contato.id, setorId: setor.id } });
  const negociosCriados: string[] = [];
  try {
    await prisma.mensagem.createMany({
      data: [
        {
          conversaId: conversa.id,
          direcao: "ENTRADA",
          origem: "WHATSAPP",
          texto: "Oi! Quero orçamento de um playground com escorregador zebrado-teste pra escola.",
          enviadaEm: new Date(Date.now() - 2 * 60e3),
        },
        { conversaId: conversa.id, direcao: "SAIDA", origem: "MANUAL", texto: "Olá! Claro, qual a cidade?", enviadaEm: new Date(Date.now() - 60e3) },
      ],
    });

    const porFinal = await buscarConversasAtendimento({ telefone: FINAL.slice(-4) });
    const achada = porFinal.conversas.find((c) => c.conversaId === conversa.id);
    checar(achada, `final de 4 dígitos (${FINAL.slice(-4)}) acha a conversa (${porFinal.total} resultado(s))`);
    checar(achada && !achada.nome_salvo && achada.telefone === "(99) 98735-7319", `sem nome salvo e telefone com o 9 (${achada?.telefone})`);
    checar(achada?.ultimas_mensagens.length === 2 && achada.ultimas_mensagens[0].de === "cliente", "últimas mensagens em ordem, a do cliente primeiro");

    const porInteiro = await buscarConversasAtendimento({ telefone: "(99) 98735-7319" });
    checar(porInteiro.conversas.some((c) => c.conversaId === conversa.id) && porInteiro.total === 1, "número inteiro com o 9 acha o contato gravado sem o 9");

    const porTexto = await buscarConversasAtendimento({ termo: "zebrado-teste" });
    const comTrecho = porTexto.conversas.find((c) => c.conversaId === conversa.id);
    checar(comTrecho?.trecho_encontrado?.texto.includes("zebrado-teste"), "trecho da mensagem acha e mostra onde apareceu");

    const hoje = new Date(Date.now() - 60 * 60 * 1000);
    const noPeriodo = await buscarConversasAtendimento({ inicio: hoje, somenteSemNome: true, limite: 200 });
    checar(noPeriodo.conversas.some((c) => c.conversaId === conversa.id), "conversa com mensagem na última hora aparece no período (só sem nome)");

    const ontem = await buscarConversasAtendimento({ telefone: FINAL, inicio: new Date(Date.now() - 3 * 86400e3), fim: new Date(Date.now() - 2 * 86400e3) });
    checar(ontem.total === 0, "fora do período não aparece");

    const cadastro = await buscarClientesPorFinalTelefone(FINAL.slice(-4));
    checar(cadastro.some((c) => c.id === contato.id), "buscar_clientes pelo final também acha o cadastro");

    await prisma.contato.update({ where: { id: contato.id }, data: { nome: "Cliente Teste Zebrado" } });
    const semNome = await buscarConversasAtendimento({ telefone: FINAL, somenteSemNome: true });
    checar(semNome.total === 0, "depois de salvar o nome, sai do filtro 'só sem nome'");
    await prisma.contato.update({ where: { id: contato.id }, data: { nome: TELEFONE } });

    const real = await buscarConversasAtendimento({ telefone: "6980" });
    console.log(`     (caso real, final 6980: ${real.conversas.map((c) => `${c.nome} ${c.telefone}`).join("; ") || "nenhum"})`);
    checar(real.total >= 1, "caso real: o final 6980 acha a conversa no Atendimento");

    if (COM_IA) {
      const marcos = await prisma.user.findFirstOrThrow({ where: { username: "marcos" } });
      const r = await processarComandoAgente({
        texto: `encontre o contato com o final ${FINAL.slice(-4)} que está no atendimento, salve o nome dele como Cliente Teste Zebrado e gere um negócio no primeiro funil de vendas, primeira etapa, com o nome Playground Teste Zebrado, e uma tarefa pra amanhã "Ligar pro Cliente Teste Zebrado"`,
        origem: "TELEGRAM",
        identificador: TG,
        usuarioId: marcos.id,
      });
      console.log(`     resposta: ${r.resposta.replace(/\n/g, " ").slice(0, 300)}`);
      const negocio = await prisma.negocio.findFirst({ where: { titulo: { contains: "Teste Zebrado" } }, orderBy: { createdAt: "desc" } });
      if (negocio) negociosCriados.push(negocio.id);
      checar(negocio?.contatoId === contato.id && negocio.origemConversaId === conversa.id, "IA: negócio criado ligado ao contato e à conversa");
      const tarefa = await prisma.tarefa.findFirst({ where: { titulo: { contains: "Teste Zebrado" } }, orderBy: { createdAt: "desc" } });
      checar(tarefa?.contatoId === contato.id && tarefa.conversaId === conversa.id, "IA: tarefa ligada ao contato e à conversa");
      checar(tarefa?.negocioId && tarefa.negocioId === negocio?.id, "IA: tarefa ligada ao negócio criado");
      const salvo = await prisma.contato.findUnique({ where: { id: contato.id }, select: { nome: true } });
      checar(salvo?.nome === "Cliente Teste Zebrado", `IA: nome salvo (${salvo?.nome})`);
    }
  } finally {
    await prisma.tarefa.deleteMany({ where: { OR: [{ contatoId: contato.id }, { conversaId: conversa.id }, { negocioId: { in: negociosCriados } }] } });
    await prisma.atividade.deleteMany({ where: { negocioId: { in: negociosCriados } } });
    await prisma.negocio.deleteMany({ where: { id: { in: negociosCriados } } });
    await prisma.mensagem.deleteMany({ where: { conversaId: conversa.id } });
    await prisma.conversa.delete({ where: { id: conversa.id } });
    await prisma.contato.delete({ where: { id: contato.id } });
    await prisma.comandoAgente.deleteMany({ where: { identificador: TG } });
  }
  console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
