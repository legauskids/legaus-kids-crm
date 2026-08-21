import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function daysFromNow(days: number): Date {
  return hoursFromNow(days * 24);
}

async function main() {
  console.log("Limpando banco de dados...");
  await prisma.lembrete.deleteMany();
  await prisma.atividade.deleteMany();
  await prisma.tarefa.deleteMany();
  await prisma.mensagemAgendada.deleteMany();
  await prisma.notaInterna.deleteMany();
  await prisma.mensagem.deleteMany();
  await prisma.negocio.deleteMany();
  await prisma.conversa.deleteMany();
  await prisma.etapa.deleteMany();
  await prisma.funil.deleteMany();
  await prisma.respostaRapida.deleteMany();
  await prisma.meta.deleteMany();
  await prisma.contato.deleteMany();
  await prisma.user.deleteMany();
  await prisma.setor.deleteMany();

  console.log("Criando usuários...");
  const daniPassword = process.env.SEED_DANI_PASSWORD ?? "dani123";
  const marcosPassword = process.env.SEED_MARCOS_PASSWORD ?? "marcos123";

  const dani = await prisma.user.create({
    data: {
      username: "dani",
      nome: "Dani",
      papel: "Atendimento / Pré-vendas / Pós-vendas",
      passwordHash: await bcrypt.hash(daniPassword, 10),
    },
  });

  const marcos = await prisma.user.create({
    data: {
      username: "marcos",
      nome: "Marcos",
      papel: "Gestão e Fechamento",
      passwordHash: await bcrypt.hash(marcosPassword, 10),
    },
  });

  console.log("Criando setores...");
  const [setorAtendimento, setorPosVenda, setorGestao] = await Promise.all([
    prisma.setor.create({ data: { nome: "Atendimento/Pré-vendas" } }),
    prisma.setor.create({ data: { nome: "Pós-vendas" } }),
    prisma.setor.create({ data: { nome: "Gestão" } }),
  ]);

  console.log("Criando funil de venda...");
  const funilVenda = await prisma.funil.create({
    data: { nome: "Funil de venda", ordem: 0 },
  });
  const etapasVenda = await Promise.all([
    prisma.etapa.create({ data: { funilId: funilVenda.id, nome: "Qualificação", ordem: 0, slaDias: 3 } }),
    prisma.etapa.create({ data: { funilId: funilVenda.id, nome: "Enviar Proposta", ordem: 1, slaDias: 5 } }),
    prisma.etapa.create({ data: { funilId: funilVenda.id, nome: "Cobrar Retorno", ordem: 2, slaDias: 3 } }),
    prisma.etapa.create({ data: { funilId: funilVenda.id, nome: "Fechamento", ordem: 3, slaDias: 2 } }),
    prisma.etapa.create({ data: { funilId: funilVenda.id, nome: "Ganho", ordem: 4, tipo: "GANHO" } }),
    prisma.etapa.create({ data: { funilId: funilVenda.id, nome: "Perdido", ordem: 5, tipo: "PERDIDO" } }),
  ]);
  const [etQualificacao, etProposta, etCobrarRetorno, etFechamento, etGanho] = etapasVenda;

  console.log("Criando funil de pós-venda...");
  const funilPosVenda = await prisma.funil.create({
    data: { nome: "Funil de pós-venda", ordem: 1 },
  });
  const etapasPosVenda = await Promise.all([
    prisma.etapa.create({ data: { funilId: funilPosVenda.id, nome: "Contrato", ordem: 0, slaDias: 1 } }),
    prisma.etapa.create({ data: { funilId: funilPosVenda.id, nome: "Pagamento", ordem: 1, slaDias: 3 } }),
    prisma.etapa.create({ data: { funilId: funilPosVenda.id, nome: "Compras", ordem: 2, slaDias: 5 } }),
    prisma.etapa.create({ data: { funilId: funilPosVenda.id, nome: "Produção", ordem: 3, slaDias: 10 } }),
    prisma.etapa.create({ data: { funilId: funilPosVenda.id, nome: "Entrega", ordem: 4, slaDias: 3 } }),
    prisma.etapa.create({ data: { funilId: funilPosVenda.id, nome: "Avaliação", ordem: 5, slaDias: 5 } }),
  ]);
  const [etContrato] = etapasPosVenda;

  console.log("Criando contatos...");
  const [contatoFernanda, contatoRicardo, contatoJuliana, contatoMarcelo, contatoPatricia, contatoEduardo] =
    await Promise.all([
      prisma.contato.create({ data: { nome: "Fernanda Lima", empresa: "Buffet Alegria Kids", telefone: "5511987650001" } }),
      prisma.contato.create({ data: { nome: "Ricardo Souza", empresa: "Condomínio Villa Verde", telefone: "5511987650002" } }),
      prisma.contato.create({ data: { nome: "Juliana Prado", empresa: "Escola Pequenos Passos", telefone: "5511987650003" } }),
      prisma.contato.create({ data: { nome: "Marcelo Tanaka", empresa: "Residencial Tanaka", telefone: "5511987650004" } }),
      prisma.contato.create({ data: { nome: "Patrícia Gomes", empresa: "Espaço Kids Gomes", telefone: "5511987650005" } }),
      prisma.contato.create({ data: { nome: "Eduardo Martins", empresa: "Shopping Park Sul", telefone: "5511987650006" } }),
    ]);

  console.log("Criando conversas, mensagens, notas e agendadas...");
  const conversaFernanda = await prisma.conversa.create({
    data: {
      contatoId: contatoFernanda.id,
      setorId: setorAtendimento.id,
      status: "FILA",
    },
  });
  await prisma.mensagem.createMany({
    data: [
      { conversaId: conversaFernanda.id, direcao: "ENTRADA", texto: "Oi, vi o Instagram de vocês! Fazem playground pra buffet infantil?", enviadaEm: hoursFromNow(-3) },
      { conversaId: conversaFernanda.id, direcao: "ENTRADA", texto: "Tenho um espaço de uns 40m² disponível.", enviadaEm: hoursFromNow(-3) },
    ],
  });

  const conversaRicardo = await prisma.conversa.create({
    data: {
      contatoId: contatoRicardo.id,
      setorId: setorAtendimento.id,
      atendenteId: dani.id,
      status: "ATENDENDO",
    },
  });
  await prisma.mensagem.createMany({
    data: [
      { conversaId: conversaRicardo.id, direcao: "ENTRADA", texto: "Bom dia, somos do condomínio Villa Verde, queremos orçar um kidplay pro playground.", enviadaEm: hoursFromNow(-30) },
      { conversaId: conversaRicardo.id, direcao: "SAIDA", texto: "Bom dia Ricardo! Claro, consegue me mandar as medidas do espaço?", origem: "MANUAL", autorUserId: dani.id, enviadaEm: hoursFromNow(-29) },
      { conversaId: conversaRicardo.id, direcao: "ENTRADA", texto: "Vou medir e te mando ainda hoje.", enviadaEm: hoursFromNow(-28) },
    ],
  });
  await prisma.notaInterna.create({
    data: {
      conversaId: conversaRicardo.id,
      autorId: dani.id,
      texto: "Cliente parece decidido, condomínio grande. Priorizar retorno.",
    },
  });
  await prisma.mensagemAgendada.create({
    data: {
      conversaId: conversaRicardo.id,
      texto: "Ricardo, tudo bem? Só passando para saber se conseguiu tirar as medidas do espaço :)",
      agendadaPara: hoursFromNow(4),
      criadaPorId: dani.id,
    },
  });

  const conversaJuliana = await prisma.conversa.create({
    data: {
      contatoId: contatoJuliana.id,
      setorId: setorAtendimento.id,
      atendenteId: marcos.id,
      status: "ATENDENDO",
    },
  });
  await prisma.mensagem.createMany({
    data: [
      { conversaId: conversaJuliana.id, direcao: "ENTRADA", texto: "Olá! Somos a Escola Pequenos Passos, queremos um espaço kids para o pátio.", enviadaEm: hoursFromNow(-50) },
      { conversaId: conversaJuliana.id, direcao: "SAIDA", texto: "Oi Juliana! Vou te enviar nossa proposta em instantes.", origem: "MANUAL", autorUserId: marcos.id, enviadaEm: hoursFromNow(-49) },
    ],
  });

  const conversaMarcelo = await prisma.conversa.create({
    data: {
      contatoId: contatoMarcelo.id,
      setorId: setorPosVenda.id,
      atendenteId: dani.id,
      status: "ATENDENDO",
    },
  });
  await prisma.mensagem.createMany({
    data: [
      { conversaId: conversaMarcelo.id, direcao: "ENTRADA", texto: "Oi Dani, quando fica pronta a instalação do nosso playground?", enviadaEm: hoursFromNow(-5) },
      { conversaId: conversaMarcelo.id, direcao: "SAIDA", texto: "Marcelo, a produção está em andamento! Assim que tivermos data de instalação te aviso.", origem: "MANUAL", autorUserId: dani.id, enviadaEm: hoursFromNow(-4) },
    ],
  });

  const conversaPatricia = await prisma.conversa.create({
    data: {
      contatoId: contatoPatricia.id,
      setorId: setorGestao.id,
      status: "FILA",
    },
  });
  await prisma.mensagem.create({
    data: {
      conversaId: conversaPatricia.id,
      direcao: "ENTRADA",
      texto: "Boa tarde, gostaria de renegociar o valor da proposta enviada.",
      enviadaEm: hoursFromNow(-1),
    },
  });

  console.log("Criando negócios...");
  const negocioFernanda = await prisma.negocio.create({
    data: {
      titulo: "Playground Buffet Alegria Kids",
      contatoId: contatoFernanda.id,
      funilId: funilVenda.id,
      etapaId: etQualificacao.id,
      valorCentavos: 1800000,
      responsavelId: dani.id,
      previsaoFechamento: daysFromNow(10),
      origem: "Instagram",
      origemConversaId: conversaFernanda.id,
    },
  });
  await prisma.atividade.create({
    data: { negocioId: negocioFernanda.id, tipo: "WHATSAPP", texto: "Negócio criado a partir da conversa no WhatsApp.", autorId: dani.id },
  });

  // Parado além do prazo de propósito, para demonstrar o alerta de SLA.
  const negocioRicardo = await prisma.negocio.create({
    data: {
      titulo: "Kidplay Condomínio Villa Verde",
      contatoId: contatoRicardo.id,
      funilId: funilVenda.id,
      etapaId: etProposta.id,
      dataEntradaNaEtapa: daysFromNow(-9),
      valorCentavos: 3200000,
      responsavelId: dani.id,
      previsaoFechamento: daysFromNow(5),
      origem: "Indicação",
      origemConversaId: conversaRicardo.id,
    },
  });
  await prisma.tarefa.create({
    data: {
      titulo: "Enviar proposta revisada para o Villa Verde",
      negocioId: negocioRicardo.id,
      contatoId: contatoRicardo.id,
      responsavelId: dani.id,
      solicitanteId: marcos.id,
      prazo: daysFromNow(-1),
      status: "A_FAZER",
      descricao: "Cliente pediu revisão de valores por telefone.",
    },
  });

  const negocioJuliana = await prisma.negocio.create({
    data: {
      titulo: "Espaço Kids Escola Pequenos Passos",
      contatoId: contatoJuliana.id,
      funilId: funilVenda.id,
      etapaId: etCobrarRetorno.id,
      valorCentavos: 2500000,
      responsavelId: marcos.id,
      previsaoFechamento: daysFromNow(7),
      origem: "Site",
      origemConversaId: conversaJuliana.id,
    },
  });

  const negocioPatricia = await prisma.negocio.create({
    data: {
      titulo: "Playground Espaço Kids Gomes",
      contatoId: contatoPatricia.id,
      funilId: funilVenda.id,
      etapaId: etFechamento.id,
      valorCentavos: 1500000,
      responsavelId: marcos.id,
      previsaoFechamento: daysFromNow(2),
      origem: "Indicação",
    },
  });

  const negocioEduardo = await prisma.negocio.create({
    data: {
      titulo: "Kidplay Shopping Park Sul",
      contatoId: contatoEduardo.id,
      funilId: funilVenda.id,
      etapaId: etGanho.id,
      valorCentavos: 8500000,
      responsavelId: marcos.id,
      previsaoFechamento: daysFromNow(-2),
      origem: "Indicação",
    },
  });

  // Pós-venda já criado, simulando a automação de "negócio Ganho".
  const negocioEduardoPosVenda = await prisma.negocio.create({
    data: {
      titulo: "Kidplay Shopping Park Sul — Pós-venda",
      contatoId: contatoEduardo.id,
      funilId: funilPosVenda.id,
      etapaId: etContrato.id,
      valorCentavos: 8500000,
      responsavelId: marcos.id,
      origem: "Indicação",
    },
  });
  await prisma.tarefa.create({
    data: {
      titulo: "Emissão de contrato",
      negocioId: negocioEduardoPosVenda.id,
      contatoId: contatoEduardo.id,
      responsavelId: dani.id,
      solicitanteId: marcos.id,
      prazo: hoursFromNow(24),
      status: "A_FAZER",
      automatica: true,
      descricao: "Gerado automaticamente após o negócio de venda ser marcado como Ganho.",
    },
  });
  await prisma.atividade.createMany({
    data: [
      { negocioId: negocioEduardo.id, tipo: "SISTEMA", texto: "Negócio marcado como Ganho. Pós-venda criado automaticamente." },
      { negocioId: negocioEduardoPosVenda.id, tipo: "SISTEMA", texto: "Negócio de pós-venda criado automaticamente a partir do fechamento da venda." },
    ],
  });

  const negocioMarceloPosVenda = await prisma.negocio.create({
    data: {
      titulo: "Playground Residencial Tanaka — Pós-venda",
      contatoId: contatoMarcelo.id,
      funilId: funilPosVenda.id,
      etapaId: etapasPosVenda[3].id, // Produção
      valorCentavos: 4200000,
      responsavelId: dani.id,
      progressoProducao: 60,
      previsaoProducao: daysFromNow(6),
      origem: "Instagram",
      origemConversaId: conversaMarcelo.id,
    },
  });

  console.log("Criando tarefas adicionais...");
  await prisma.tarefa.create({
    data: {
      titulo: "Aprovar orçamento de materiais — Tanaka",
      negocioId: negocioMarceloPosVenda.id,
      responsavelId: marcos.id,
      solicitanteId: dani.id,
      prazo: daysFromNow(2),
      status: "APROVACAO",
      descricao: "Orçamento de compra de madeira plástica e ferragens acima do previsto em 8%. Precisa de aprovação para seguir com a compra.",
    },
  });
  await prisma.tarefa.create({
    data: {
      titulo: "Ligar para Patrícia sobre renegociação",
      negocioId: negocioPatricia.id,
      contatoId: contatoPatricia.id,
      conversaId: conversaPatricia.id,
      responsavelId: marcos.id,
      solicitanteId: marcos.id,
      prazo: hoursFromNow(6),
      status: "EM_ANDAMENTO",
      descricao: "Cliente quer desconto de 10%. Avaliar margem antes de responder.",
    },
  });
  await prisma.tarefa.create({
    data: {
      titulo: "Follow-up semanal — Buffet Alegria Kids",
      negocioId: negocioFernanda.id,
      responsavelId: dani.id,
      solicitanteId: dani.id,
      prazo: daysFromNow(3),
      status: "A_FAZER",
      descricao: "Confirmar se o cliente já validou o orçamento internamente.",
    },
  });
  await prisma.tarefa.create({
    data: {
      titulo: "Organizar amostras de piso emborrachado",
      responsavelId: dani.id,
      solicitanteId: marcos.id,
      prazo: daysFromNow(1),
      status: "CONCLUIDA",
      descricao: "Separar amostras para visitas comerciais da semana.",
    },
  });

  console.log("Criando respostas rápidas...");
  await prisma.respostaRapida.createMany({
    data: [
      { titulo: "Boas-vindas", texto: "Olá! Somos a Legaus Kids, fábrica de espaços kids sob medida 🧒🛝. Como podemos ajudar?", escopo: "COMPARTILHADA" },
      { titulo: "Pedido de medidas", texto: "Para montarmos um orçamento, você pode nos enviar as medidas (largura x comprimento) do espaço disponível?", escopo: "COMPARTILHADA" },
      { titulo: "Prazo de produção padrão", texto: "Nosso prazo médio de produção é de 20 a 30 dias úteis após aprovação do orçamento e pagamento inicial.", escopo: "COMPARTILHADA" },
      { titulo: "Assinatura Dani", texto: "Qualquer dúvida, estou por aqui! — Dani, Legaus Kids", escopo: "PESSOAL", donoId: dani.id },
      { titulo: "Assinatura Marcos", texto: "Fico à disposição para fechar os detalhes. — Marcos, Legaus Kids", escopo: "PESSOAL", donoId: marcos.id },
    ],
  });

  console.log("Criando meta do mês...");
  const now = new Date();
  await prisma.meta.create({
    data: { mes: now.getMonth() + 1, ano: now.getFullYear(), valorAlvoCentavos: 5000000 },
  });

  console.log("Seed concluído.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
