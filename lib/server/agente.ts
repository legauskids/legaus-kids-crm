import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { criarContato } from "@/lib/server/contatos";
import { salvarOrcamento, buscarOrcamentoPorId, listarOrcamentos, garantirTokenPublico, calcularTotalCentavos } from "@/lib/server/orcamentos";
import { criarTarefa, listTarefas } from "@/lib/server/tarefas";
import { encontrarOuCriarConversaPorTelefone, registrarMensagem } from "@/lib/server/conversas";
import { reaisParaCentavos, centavosParaReais } from "@/lib/utils/money";
import { URL_BASE } from "@/lib/constants/app";
import type { OrigemComando } from "@prisma/client";

const MODELO = "claude-sonnet-5";
const JANELA_PENDENTE_MS = 10 * 60 * 1000; // 10 minutos pra confirmar antes de expirar

// ---------------------------------------------------------------------------
// Ferramentas — cada uma vira uma "tool" pro Claude decidir chamar. As
// marcadas sensivel:true nunca executam na primeira vez: viram uma pergunta
// de confirmação (ver processarComandoAgente) e só rodam de verdade se a
// PRÓXIMA mensagem da mesma origem (telefone no WhatsApp, "crm:<userId>" no
// CRM) confirmar.
// ---------------------------------------------------------------------------

// JSON Schema simplificado, só o suficiente pro parâmetro `tools` da API da
// Anthropic — evita depender de um tipo aninhado da SDK que pode mudar de
// versão pra versão.
type EsquemaEntrada = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
};

type ArgsFerramenta = Record<string, unknown>;

type Ferramenta = {
  name: string;
  description: string;
  input_schema: EsquemaEntrada;
  sensivel?: boolean;
  descreverAcao?: (args: ArgsFerramenta) => Promise<string>;
  executar: (args: ArgsFerramenta, ctx: { usuarioId: string }) => Promise<unknown>;
};

/**
 * Resolve um orçamento por ID interno OU por número humano ("orçamento nº
 * 8") — o histórico de conversa do agente só guarda o texto da resposta
 * final, que menciona o número, não o ID interno, então o número precisa
 * funcionar sozinho quando o agente lembra de um orçamento citado antes.
 */
async function resolverOrcamento(args: { orcamentoId?: string; numero?: number }) {
  if (args.orcamentoId) {
    const orcamento = await buscarOrcamentoPorId(args.orcamentoId);
    if (orcamento) return orcamento;
  }
  if (args.numero) {
    const todos = await listarOrcamentos();
    const encontrado = todos.find((o) => o.numero === args.numero);
    if (encontrado) return buscarOrcamentoPorId(encontrado.id);
  }
  return null;
}

const FERRAMENTAS: Ferramenta[] = [
  {
    name: "buscar_clientes",
    description: "Busca clientes/contatos cadastrados pelo nome ou razão social. Use antes de criar orçamento ou tarefa pra achar o ID do cliente.",
    input_schema: {
      type: "object",
      properties: { termo: { type: "string", description: "Nome ou parte do nome do cliente" } },
      required: ["termo"],
    },
    async executar(args) {
      const { termo } = args as { termo: string };
      const contatos = await prisma.contato.findMany({
        where: {
          OR: [
            { nome: { contains: termo, mode: "insensitive" } },
            { razaoSocial: { contains: termo, mode: "insensitive" } },
          ],
        },
        select: { id: true, nome: true, razaoSocial: true, telefone: true, email: true, tipo: true },
        take: 8,
      });
      return contatos.length > 0 ? contatos : "Nenhum cliente encontrado com esse nome.";
    },
  },
  {
    name: "criar_cliente",
    description: "Cria um cliente novo, quando o comando menciona um cliente que ainda não existe no cadastro.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        telefone: { type: "string", description: "Com DDD, só números, opcional" },
      },
      required: ["nome"],
    },
    async executar(args) {
      const { nome, telefone } = args as { nome: string; telefone?: string };
      const contato = await criarContato({ nome, telefone: telefone || null, tipo: "CLIENTE" });
      return { id: contato.id, nome: contato.nome };
    },
  },
  {
    name: "buscar_produtos",
    description: "Busca produtos do catálogo pelo nome ou código, pra usar em um orçamento.",
    input_schema: {
      type: "object",
      properties: { termo: { type: "string" } },
      required: ["termo"],
    },
    async executar(args) {
      const { termo } = args as { termo: string };
      const produtos = await prisma.produto.findMany({
        where: {
          ativo: true,
          OR: [
            { nome: { contains: termo, mode: "insensitive" } },
            { codigo: { contains: termo, mode: "insensitive" } },
          ],
        },
        select: { id: true, nome: true, codigo: true, categoria: true, valorCentavos: true },
        take: 8,
      });
      return produtos.length > 0
        ? produtos.map((p) => ({ ...p, valor: p.valorCentavos != null ? centavosParaReais(p.valorCentavos) : "sem valor cadastrado" }))
        : "Nenhum produto encontrado com esse nome.";
    },
  },
  {
    name: "buscar_orcamentos",
    description: "Lista orçamentos recentes, opcionalmente filtrando por número ou nome do cliente.",
    input_schema: {
      type: "object",
      properties: {
        numero: { type: "integer", description: "Número do orçamento, se o comando mencionar um específico" },
        clienteNome: { type: "string" },
      },
    },
    async executar(args) {
      const { numero, clienteNome } = args as { numero?: number; clienteNome?: string };
      const todos = await listarOrcamentos();
      let filtrados = todos;
      if (numero) filtrados = filtrados.filter((o) => o.numero === numero);
      if (clienteNome) {
        const termo = clienteNome.toLowerCase();
        filtrados = filtrados.filter((o) => o.contato?.nome.toLowerCase().includes(termo));
      }
      return filtrados.slice(0, 8).map((o) => ({
        id: o.id,
        numero: o.numero,
        cliente: o.contato?.nome ?? "sem cliente",
        status: o.status,
        total: centavosParaReais(calcularTotalCentavos(o.itens, o.descontoCentavos)),
      }));
    },
  },
  {
    name: "criar_orcamento",
    description:
      "Cria um orçamento novo (rascunho) com um ou mais itens. Pra cada item, informe produtoNome (nome de um produto do catálogo, buscado com buscar_produtos antes se precisar do ID certo) OU um item avulso com nome/valor próprios.",
    input_schema: {
      type: "object",
      properties: {
        clienteId: { type: "string", description: "ID do cliente, se já souber (de buscar_clientes)" },
        itens: {
          type: "array",
          items: {
            type: "object",
            properties: {
              produtoId: { type: "string" },
              nome: { type: "string", description: "Nome do item (obrigatório se não for produtoId)" },
              quantidade: { type: "integer", default: 1 },
              valorUnitarioReais: { type: "number", description: "Só se for item avulso ou pra sobrescrever o preço do produto" },
            },
          },
        },
        observacoes: { type: "string" },
      },
      required: ["itens"],
    },
    async executar(args, { usuarioId }) {
      const { clienteId, itens, observacoes } = args as {
        clienteId?: string;
        observacoes?: string;
        itens: { produtoId?: string; nome?: string; quantidade?: number; valorUnitarioReais?: number }[];
      };
      const itensResolvidos = [];
      for (const item of itens) {
        if (item.produtoId) {
          const produto = await prisma.produto.findUnique({ where: { id: item.produtoId } });
          if (!produto) continue;
          itensResolvidos.push({
            produtoId: produto.id,
            nome: produto.nome,
            descricao: produto.descricao,
            quantidade: Math.max(1, item.quantidade || 1),
            valorUnitarioCentavos: item.valorUnitarioReais != null ? reaisParaCentavos(item.valorUnitarioReais) : produto.valorCentavos ?? 0,
          });
        } else {
          itensResolvidos.push({
            produtoId: null,
            nome: item.nome || "Item",
            quantidade: Math.max(1, item.quantidade || 1),
            valorUnitarioCentavos: reaisParaCentavos(item.valorUnitarioReais || 0),
          });
        }
      }
      if (itensResolvidos.length === 0) throw new Error("Nenhum item válido informado.");

      const orcamento = await salvarOrcamento({
        contatoId: clienteId || null,
        responsavelId: usuarioId,
        observacoes: observacoes || null,
        itens: itensResolvidos,
      });
      const total = calcularTotalCentavos(itensResolvidos, 0);
      return { id: orcamento.id, numero: orcamento.numero, total: centavosParaReais(total) };
    },
  },
  {
    name: "enviar_orcamento_whatsapp",
    description:
      "Envia um orçamento já criado pro WhatsApp do cliente. Ação sensível — sempre pede confirmação antes. Informe orcamentoId (se tiver, ex: veio de buscar_orcamentos/criar_orcamento nessa mesma conversa) OU numero (o número humano do orçamento, ex: 8 — funciona mesmo sem saber o ID interno).",
    input_schema: {
      type: "object",
      properties: {
        orcamentoId: { type: "string" },
        numero: { type: "integer", description: "Número do orçamento (ex: 8), alternativa ao orcamentoId" },
        telefone: { type: "string", description: "Com DDD, só números — usa o telefone do cliente vinculado se não informado" },
      },
    },
    sensivel: true,
    async descreverAcao(args) {
      const orcamento = await resolverOrcamento(args as { orcamentoId?: string; numero?: number });
      if (!orcamento) return "orçamento não encontrado";
      const total = calcularTotalCentavos(orcamento.itens, orcamento.descontoCentavos);
      return `enviar o orçamento #${String(orcamento.numero).padStart(4, "0")} (${centavosParaReais(total)}) pro WhatsApp de ${orcamento.contato?.nome ?? "cliente sem nome vinculado"}`;
    },
    async executar(args) {
      const { telefone } = args as { telefone?: string };
      const orcamento = await resolverOrcamento(args as { orcamentoId?: string; numero?: number });
      if (!orcamento) throw new Error("Orçamento não encontrado.");
      const telefoneFinal = (telefone || orcamento.contato?.telefone || "").replace(/\D/g, "");
      if (telefoneFinal.length < 10) throw new Error("Não tenho um telefone válido pra esse cliente.");

      const token = await garantirTokenPublico(orcamento.id);
      const link = `${URL_BASE}/publico/orcamento/${token}`;
      const total = calcularTotalCentavos(orcamento.itens, orcamento.descontoCentavos);
      const texto =
        `Olá! Segue o orçamento *#${String(orcamento.numero).padStart(4, "0")}* da Legaus Kids, ` +
        `no valor de ${centavosParaReais(total)}.\n\nVocê pode conferir todos os detalhes aqui: ${link}\n\nQualquer dúvida, estamos à disposição!`;

      const conversa = await encontrarOuCriarConversaPorTelefone({ telefone: telefoneFinal, nomeContato: orcamento.contato?.nome });
      await registrarMensagem({ conversaId: conversa.id, texto, direcao: "SAIDA", origem: "SISTEMA" });
      return { enviado: true, numero: orcamento.numero };
    },
  },
  {
    name: "criar_tarefa",
    description: "Cria uma tarefa/lembrete de trabalho, com prazo.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        prazoDias: { type: "integer", description: "Em quantos dias a partir de hoje. Padrão 1 (amanhã).", default: 1 },
        descricao: { type: "string" },
      },
      required: ["titulo"],
    },
    async executar(args, { usuarioId }) {
      const { titulo, prazoDias, descricao } = args as { titulo: string; prazoDias?: number; descricao?: string };
      const prazo = new Date();
      prazo.setDate(prazo.getDate() + (prazoDias ?? 1));
      const tarefa = await criarTarefa({
        titulo,
        descricao: descricao || null,
        prazo,
        responsavelId: usuarioId,
        solicitanteId: usuarioId,
      });
      return { id: tarefa.id, titulo: tarefa.titulo, prazo: prazo.toLocaleDateString("pt-BR") };
    },
  },
  {
    name: "buscar_negocios",
    description: "Lista negócios em andamento, opcionalmente filtrando por nome do cliente.",
    input_schema: {
      type: "object",
      properties: { clienteNome: { type: "string" } },
    },
    async executar(args) {
      const { clienteNome } = args as { clienteNome?: string };
      const negocios = await prisma.negocio.findMany({
        where: clienteNome ? { contato: { nome: { contains: clienteNome, mode: "insensitive" } } } : undefined,
        include: { contato: true, etapa: true, funil: true },
        orderBy: { updatedAt: "desc" },
        take: 8,
      });
      return negocios.length > 0
        ? negocios.map((n) => ({
            id: n.id,
            titulo: n.titulo,
            cliente: n.contato?.nome ?? "sem cliente",
            etapa: n.etapa.nome,
            funil: n.funil.nome,
            valor: centavosParaReais(n.valorCentavos),
          }))
        : "Nenhum negócio encontrado.";
    },
  },
  {
    name: "resumo_do_dia",
    description: "Dá um resumo rápido: tarefas com prazo pra hoje/atrasadas e orçamentos em rascunho ou enviados aguardando resposta.",
    input_schema: { type: "object", properties: {} },
    async executar() {
      const hoje = new Date();
      hoje.setHours(23, 59, 59, 999);
      const [tarefas, orcamentos] = await Promise.all([listTarefas(), listarOrcamentos()]);
      const tarefasPendentes = tarefas.filter((t) => t.status !== "CONCLUIDA" && t.prazo <= hoje).slice(0, 10);
      const orcamentosAbertos = orcamentos.filter((o) => o.status === "RASCUNHO" || o.status === "ENVIADO").slice(0, 10);
      return {
        tarefas_pendentes_ou_atrasadas: tarefasPendentes.map((t) => ({ titulo: t.titulo, prazo: t.prazo.toLocaleDateString("pt-BR") })),
        orcamentos_em_aberto: orcamentosAbertos.map((o) => ({ numero: o.numero, cliente: o.contato?.nome ?? "sem cliente", status: o.status })),
      };
    },
  },
];

function paraToolAnthropic(f: Ferramenta): Anthropic.Tool {
  return { name: f.name, description: f.description, input_schema: f.input_schema };
}

const SYSTEM_PROMPT = `Você é o assistente de automação do CRM da Legaus Kids (fabricante de playgrounds e parques infantis). Marcos, o dono, dá comandos por voz ou texto e você executa usando as ferramentas disponíveis.

Regras:
- Responda sempre em português do Brasil, direto e objetivo — poucas frases, sem enrolação, como se estivesse falando com o Marcos por WhatsApp.
- A resposta pode ir pro WhatsApp de verdade — formate como WhatsApp, não como Markdown: *asterisco simples* pra negrito (nunca **duplo**), _underline_ pra itálico, sem títulos com #, sem tabelas.
- Sempre que o comando envolver um cliente ou produto por nome, use buscar_clientes ou buscar_produtos primeiro pra achar o ID certo antes de criar algo. Se houver mais de um resultado parecido, pergunte qual é.
- Você tem acesso ao histórico recente da conversa — "esse orçamento", "ele", "o cliente que acabei de criar" etc. se referem ao que apareceu nas mensagens anteriores. Não peça pra repetir uma informação que já foi dada antes.
- Ferramentas sensíveis (como enviar_orcamento_whatsapp) nunca executam de primeira — o resultado da ferramenta vai te dizer que está pendente de confirmação. Nesse caso, pergunte a confirmação pro Marcos com suas próprias palavras, mencionando os detalhes principais (cliente, valor, número do orçamento).
- Se não achar o que foi pedido (cliente, produto, orçamento), diga isso claramente em vez de inventar.
- Depois de executar uma ação com sucesso, confirme o que foi feito em uma frase curta.`;

const JANELA_HISTORICO_MS = 30 * 60 * 1000; // conversas de mais de 30min atrás não entram como contexto
const MAX_TROCAS_HISTORICO = 6;

/** Busca as últimas trocas dessa origem pra dar memória de curto prazo ao agente — sem isso, "manda esse orçamento" não sabe qual "esse". */
async function buscarHistoricoRecente(identificador: string): Promise<Anthropic.MessageParam[]> {
  const limite = new Date(Date.now() - JANELA_HISTORICO_MS);
  const recentes = await prisma.comandoAgente.findMany({
    where: { identificador, criadoEm: { gte: limite }, resposta: { not: null } },
    orderBy: { criadoEm: "desc" },
    take: MAX_TROCAS_HISTORICO,
  });
  const mensagens: Anthropic.MessageParam[] = [];
  for (const c of recentes.reverse()) {
    mensagens.push({ role: "user", content: c.textoComando });
    mensagens.push({ role: "assistant", content: c.resposta! });
  }
  return mensagens;
}

async function rodarAgenteClaude(
  textoComando: string,
  usuarioId: string,
  identificador: string,
): Promise<{ texto: string; ferramentaPendente: { nome: string; args: unknown; descricao: string } | null; ferramentasChamadas: string[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      texto: "O agente ainda não está configurado (falta a chave da Anthropic no servidor). Avisa o Marcos.",
      ferramentaPendente: null,
      ferramentasChamadas: [],
    };
  }

  const client = new Anthropic({ apiKey });
  const historico = await buscarHistoricoRecente(identificador);
  const messages: Anthropic.MessageParam[] = [...historico, { role: "user", content: textoComando }];
  let ferramentaPendente: { nome: string; args: unknown; descricao: string } | null = null;
  const ferramentasChamadas: string[] = [];

  for (let turno = 0; turno < 5; turno++) {
    const resposta = await client.messages.create({
      model: MODELO,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: FERRAMENTAS.map(paraToolAnthropic),
      messages,
    });

    messages.push({ role: "assistant", content: resposta.content });

    const usosDeFerramenta = resposta.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (usosDeFerramenta.length === 0) {
      const textoFinal = resposta.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { texto: textoFinal || "Feito.", ferramentaPendente, ferramentasChamadas };
    }

    const resultadosFerramenta: Anthropic.ToolResultBlockParam[] = [];
    for (const uso of usosDeFerramenta) {
      const ferramenta = FERRAMENTAS.find((f) => f.name === uso.name);
      ferramentasChamadas.push(uso.name);
      if (!ferramenta) {
        resultadosFerramenta.push({ type: "tool_result", tool_use_id: uso.id, content: "ferramenta desconhecida", is_error: true });
        continue;
      }
      const entrada = uso.input as ArgsFerramenta;
      if (ferramenta.sensivel) {
        const descricao = ferramenta.descreverAcao ? await ferramenta.descreverAcao(entrada) : ferramenta.name;
        ferramentaPendente = { nome: uso.name, args: entrada, descricao };
        resultadosFerramenta.push({
          type: "tool_result",
          tool_use_id: uso.id,
          content: `Ação NÃO executada ainda — está pendente de confirmação do usuário. Pergunte, com suas palavras, se confirma: "${descricao}". Não diga que já foi feito.`,
        });
        continue;
      }
      try {
        const resultado = await ferramenta.executar(entrada, { usuarioId });
        resultadosFerramenta.push({ type: "tool_result", tool_use_id: uso.id, content: JSON.stringify(resultado) });
      } catch (erro) {
        resultadosFerramenta.push({
          type: "tool_result",
          tool_use_id: uso.id,
          content: `Erro: ${erro instanceof Error ? erro.message : "desconhecido"}`,
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: resultadosFerramenta });
  }

  return { texto: "Não consegui concluir — o comando ficou grande demais pra resolver em uma rodada. Tenta dividir em partes.", ferramentaPendente, ferramentasChamadas };
}

function interpretarConfirmacao(texto: string): "sim" | "nao" | "ambiguo" {
  const t = texto.trim().toLowerCase();
  if (/^(sim|s|ss|confirmo|confirma(do)?|pode|manda|mandar|isso|ok|okay|beleza|exato|é isso|isso mesmo|correto)\b/.test(t)) return "sim";
  if (/^(n[aã]o|n|cancela(r)?|para|deixa|esquece)\b/.test(t)) return "nao";
  return "ambiguo";
}

async function buscarPendenteAtivo(identificador: string) {
  const limite = new Date(Date.now() - JANELA_PENDENTE_MS);
  return prisma.comandoAgente.findFirst({
    where: { identificador, status: "AGUARDANDO_CONFIRMACAO", criadoEm: { gte: limite } },
    orderBy: { criadoEm: "desc" },
  });
}

export async function processarComandoAgente(input: {
  texto: string;
  origem: OrigemComando;
  identificador: string;
  usuarioId: string;
}): Promise<{ resposta: string }> {
  const pendente = await buscarPendenteAtivo(input.identificador);

  if (pendente && pendente.ferramentaPendente) {
    const decisao = interpretarConfirmacao(input.texto);
    if (decisao === "sim") {
      const ferramenta = FERRAMENTAS.find((f) => f.name === pendente.ferramentaPendente);
      let resposta: string;
      try {
        if (ferramenta) {
          await ferramenta.executar((pendente.argumentosPendentes ?? {}) as ArgsFerramenta, { usuarioId: input.usuarioId });
        }
        resposta = `Feito — ${pendente.descricaoPendente}.`;
      } catch (erro) {
        resposta = `Tentei executar mas deu erro: ${erro instanceof Error ? erro.message : "desconhecido"}`;
      }
      await prisma.comandoAgente.update({ where: { id: pendente.id }, data: { status: "CONCLUIDO" } });
      await prisma.comandoAgente.create({
        data: { origem: input.origem, identificador: input.identificador, usuarioId: input.usuarioId, textoComando: input.texto, resposta, status: "CONCLUIDO" },
      });
      return { resposta };
    }
    if (decisao === "nao") {
      const resposta = "Combinado, não fiz nada.";
      await prisma.comandoAgente.update({ where: { id: pendente.id }, data: { status: "CANCELADO" } });
      await prisma.comandoAgente.create({
        data: { origem: input.origem, identificador: input.identificador, usuarioId: input.usuarioId, textoComando: input.texto, resposta, status: "CONCLUIDO" },
      });
      return { resposta };
    }
    // ambíguo: expira o pendente antigo e processa como comando novo
    await prisma.comandoAgente.update({ where: { id: pendente.id }, data: { status: "CANCELADO" } });
  }

  const resultado = await rodarAgenteClaude(input.texto, input.usuarioId, input.identificador);

  await prisma.comandoAgente.create({
    data: {
      origem: input.origem,
      identificador: input.identificador,
      usuarioId: input.usuarioId,
      textoComando: input.texto,
      resposta: resultado.texto,
      status: resultado.ferramentaPendente ? "AGUARDANDO_CONFIRMACAO" : "CONCLUIDO",
      ferramentaPendente: resultado.ferramentaPendente?.nome,
      argumentosPendentes: resultado.ferramentaPendente ? (resultado.ferramentaPendente.args as object) : undefined,
      descricaoPendente: resultado.ferramentaPendente?.descricao,
    },
  });

  return { resposta: resultado.texto };
}

export function listarHistoricoComandos(identificador: string, limite = 30) {
  return prisma.comandoAgente.findMany({
    where: { identificador },
    orderBy: { criadoEm: "desc" },
    take: limite,
  });
}
