// Mensagem agendada nas tarefas (26/10/2026): agenda, lista, cancela e
// confere as regras com o banco de verdade. Usa contatos de teste com
// telefone falso e horários no FUTURO (nada chega a ser enviado) e apaga
// tudo no fim. Rodar:
// npx tsx --conditions=react-server --env-file=.env scripts/teste-mensagem-tarefa.ts
import { prisma } from "@/lib/db";
import {
  agendarMensagemDaTarefa,
  buscarContatosComTelefone,
  cancelarMensagemDaTarefa,
  conferirMensagemDeNovaTarefa,
  mensagensDasTarefas,
} from "@/lib/server/tarefa-mensagem";

let falhas = 0;
const checar = (c: unknown, m: string) => {
  console.log(`${c ? "ok  " : "FALHOU"} ${m}`);
  if (!c) falhas++;
};

const HORA = 60 * 60 * 1000;
const sufixo = String(Date.now()).slice(-6);

async function main() {
  const marcos = await prisma.user.findFirstOrThrow({ where: { username: "marcos" } });
  const funil = await prisma.funil.findFirstOrThrow({ include: { etapas: { orderBy: { ordem: "asc" }, take: 1 } } });
  const criados = { contatos: [] as string[], negocios: [] as string[], tarefas: [] as string[] };

  try {
    const cliente = await prisma.contato.create({ data: { nome: `[TESTE] Cliente mensagem ${sufixo}`, telefone: `5599000${sufixo}` } });
    const semFone = await prisma.contato.create({ data: { nome: `[TESTE] Sem telefone ${sufixo}` } });
    const outro = await prisma.contato.create({ data: { nome: `[TESTE] Avulso ${sufixo}`, telefone: `5599111${sufixo}` } });
    criados.contatos.push(cliente.id, semFone.id, outro.id);
    const negocio = await prisma.negocio.create({
      data: { titulo: `[TESTE] Negócio mensagem ${sufixo}`, contatoId: cliente.id, funilId: funil.id, etapaId: funil.etapas[0].id, responsavelId: marcos.id },
    });
    const negocioSemContato = await prisma.negocio.create({
      data: { titulo: `[TESTE] Negócio sem contato ${sufixo}`, funilId: funil.id, etapaId: funil.etapas[0].id, responsavelId: marcos.id },
    });
    criados.negocios.push(negocio.id, negocioSemContato.id);
    const base = { responsavelId: marcos.id, solicitanteId: marcos.id };
    const doNegocio = await prisma.tarefa.create({ data: { ...base, titulo: "[TESTE] Follow-up do orçamento", negocioId: negocio.id, prazo: new Date(Date.now() + 26 * HORA) } });
    const avulsa = await prisma.tarefa.create({ data: { ...base, titulo: "[TESTE] Avulsa", prazo: new Date(Date.now() + 30 * HORA) } });
    const vencida = await prisma.tarefa.create({ data: { ...base, titulo: "[TESTE] Prazo passado", negocioId: negocio.id, prazo: new Date(Date.now() - HORA) } });
    const irma = await prisma.tarefa.create({ data: { ...base, titulo: "[TESTE] Outra tarefa do mesmo negócio", negocioId: negocio.id, prazo: new Date(Date.now() + 28 * HORA) } });
    const doSemFone = await prisma.tarefa.create({ data: { ...base, titulo: "[TESTE] Contato sem telefone", contatoId: semFone.id, prazo: new Date(Date.now() + 26 * HORA) } });
    criados.tarefas.push(doNegocio.id, avulsa.id, vencida.id, doSemFone.id, irma.id);

    // 1. Tarefa de negócio: vai pro contato do negócio, no prazo quando não escolhe horário.
    const r1 = await agendarMensagemDaTarefa({ tarefaId: doNegocio.id, texto: "  Oi! Conseguiu ver o orçamento?  ", quando: null, usuarioId: marcos.id });
    checar(r1.ok && r1.contatoNome === cliente.nome && r1.agendadaPara.getTime() === doNegocio.prazo.getTime(), "tarefa do negócio: agenda pro contato do negócio, no prazo da tarefa");
    const conversa = await prisma.conversa.findFirst({ where: { contatoId: cliente.id }, include: { setor: true } });
    checar(conversa?.setor.nome === "Atendimento/Pré-vendas", "contato sem conversa: cria a conversa na fila do Atendimento");
    const amanha9 = new Date(Date.now() + 20 * HORA);
    const r2 = await agendarMensagemDaTarefa({ tarefaId: doNegocio.id, texto: "Segunda mensagem", quando: amanha9, usuarioId: marcos.id });
    checar(r2.ok && (await prisma.conversa.count({ where: { contatoId: cliente.id } })) === 1, "segunda mensagem: usa a mesma conversa");
    const agendadas = await prisma.mensagemAgendada.findMany({ where: { conversaId: conversa!.id }, orderBy: { agendadaPara: "asc" } });
    checar(agendadas.length === 2 && agendadas[1].texto === "Oi! Conseguiu ver o orçamento?" && agendadas.every((a) => a.status === "PENDENTE"), "as duas ficam pendentes na fila de agendadas (texto sem espaços sobrando)");
    checar(agendadas.every((a) => a.tarefaId === doNegocio.id), "cada mensagem guarda a tarefa de onde saiu");
    // Uma marcada pelo Atendimento pro mesmo contato (sem tarefa) não aparece nas tarefas.
    await prisma.mensagemAgendada.create({ data: { conversaId: conversa!.id, texto: "Do Atendimento", agendadaPara: amanha9, criadaPorId: marcos.id } });

    // 2. Regras.
    const vencidaSemHora = await agendarMensagemDaTarefa({ tarefaId: vencida.id, texto: "Oi", quando: null, usuarioId: marcos.id });
    checar(!vencidaSemHora.ok && /prazo da tarefa já passou/.test(vencidaSemHora.error), "prazo passado e sem horário: pede pra escolher quando");
    const passado = await agendarMensagemDaTarefa({ tarefaId: doNegocio.id, texto: "Oi", quando: new Date(Date.now() - 1000), usuarioId: marcos.id });
    checar(!passado.ok && /pelo menos 1 minuto/.test(passado.error), "horário no passado: recusa");
    const vazia = await agendarMensagemDaTarefa({ tarefaId: doNegocio.id, texto: "   ", quando: amanha9, usuarioId: marcos.id });
    checar(!vazia.ok && vazia.error === "Escreva a mensagem.", "mensagem vazia: recusa");
    const fone = await agendarMensagemDaTarefa({ tarefaId: doSemFone.id, texto: "Oi", quando: amanha9, usuarioId: marcos.id });
    checar(!fone.ok && /não tem telefone/.test(fone.error), "contato sem telefone: avisa pra cadastrar");

    // 3. Tarefa avulsa sem contato: precisa escolher; o escolhido vira o contato da tarefa.
    const semEscolher = await agendarMensagemDaTarefa({ tarefaId: avulsa.id, texto: "Oi", quando: null, usuarioId: marcos.id });
    checar(!semEscolher.ok && /escolha pra quem/.test(semEscolher.error), "avulsa sem contato: pede pra escolher o contato");
    const escolhido = await agendarMensagemDaTarefa({ tarefaId: avulsa.id, texto: "Oi, avulsa", quando: null, usuarioId: marcos.id, contatoId: outro.id });
    const avulsaDepois = await prisma.tarefa.findUniqueOrThrow({ where: { id: avulsa.id } });
    checar(escolhido.ok && avulsaDepois.contatoId === outro.id, "avulsa: agenda pro contato escolhido e liga ele à tarefa");

    // 4. O que as telas mostram.
    const telas = await mensagensDasTarefas([doNegocio.id, avulsa.id, doSemFone.id, irma.id]);
    checar(telas[irma.id].destino?.id === cliente.id && telas[irma.id].agendadas.length === 0, "outra tarefa do mesmo negócio: mesmo contato, mas não mostra as mensagens da irmã nem a do Atendimento");
    checar(telas[doNegocio.id].destino?.id === cliente.id && telas[doNegocio.id].agendadas.length === 2, "tela: tarefa do negócio mostra o destino e as 2 agendadas");
    checar(telas[avulsa.id].agendadas.length === 1 && telas[avulsa.id].agendadas[0].texto === "Oi, avulsa", "tela: avulsa mostra só a dela");
    checar(telas[doSemFone.id].destino?.telefone === null && telas[doSemFone.id].agendadas.length === 0, "tela: contato sem telefone aparece sem telefone");

    // 5. Cancelar.
    const alvo = telas[doNegocio.id].agendadas[0].id;
    checar((await cancelarMensagemDaTarefa(alvo)).ok, "cancela a pendente");
    const deNovo = await cancelarMensagemDaTarefa(alvo);
    checar(!deNovo.ok, "cancelar de novo: avisa que já não está pendente");
    const telas2 = await mensagensDasTarefas([doNegocio.id]);
    checar(telas2[doNegocio.id].agendadas.length === 1 && telas2[doNegocio.id].agendadas.every((a) => a.id !== alvo), "cancelada some da tarefa");

    // 6. Criar tarefa já com mensagem: confere antes.
    const prazoNovo = new Date(Date.now() + 26 * HORA);
    checar((await conferirMensagemDeNovaTarefa({ texto: "Oi", quando: null, prazo: prazoNovo, negocioId: negocio.id })) === null, "nova tarefa no negócio com contato: ok");
    checar(/não tem contato/.test((await conferirMensagemDeNovaTarefa({ texto: "Oi", quando: null, prazo: prazoNovo, negocioId: negocioSemContato.id })) ?? ""), "nova tarefa em negócio sem contato: recusa");
    checar(/Escolha pra quem/.test((await conferirMensagemDeNovaTarefa({ texto: "Oi", quando: null, prazo: prazoNovo })) ?? ""), "nova tarefa avulsa sem escolher contato: recusa");
    checar(/não tem telefone/.test((await conferirMensagemDeNovaTarefa({ texto: "Oi", quando: null, prazo: prazoNovo, contatoId: semFone.id })) ?? ""), "nova tarefa avulsa com contato sem telefone: recusa");

    // 7. Busca de contato pro seletor.
    const busca = await buscarContatosComTelefone(`Avulso ${sufixo}`);
    const buscaFone = await buscarContatosComTelefone(`111${sufixo}`);
    const buscaSemFone = await buscarContatosComTelefone(`Sem telefone ${sufixo}`);
    checar(busca.some((c) => c.id === outro.id) && buscaFone.some((c) => c.id === outro.id) && buscaSemFone.length === 0, "busca acha por nome e por telefone, e só traz contato com telefone");
  } finally {
    const conversas = await prisma.conversa.findMany({ where: { contatoId: { in: criados.contatos } }, select: { id: true } });
    const conversaIds = conversas.map((c) => c.id);
    await prisma.mensagemAgendada.deleteMany({ where: { conversaId: { in: conversaIds } } });
    await prisma.mensagem.deleteMany({ where: { conversaId: { in: conversaIds } } });
    await prisma.tarefa.deleteMany({ where: { id: { in: criados.tarefas } } });
    await prisma.conversa.deleteMany({ where: { id: { in: conversaIds } } });
    await prisma.negocio.deleteMany({ where: { id: { in: criados.negocios } } });
    await prisma.contato.deleteMany({ where: { id: { in: criados.contatos } } });
  }
  const sobrou = await prisma.contato.count({ where: { nome: { contains: sufixo }, AND: { nome: { startsWith: "[TESTE]" } } } });
  checar(sobrou === 0, "apagou tudo o que o teste criou");
  console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
