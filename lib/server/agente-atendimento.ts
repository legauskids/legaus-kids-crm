import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getConversaDetalhada } from "@/lib/server/conversas";
import { listNegociosPorContato } from "@/lib/server/negocios";
import { listarOrcamentos } from "@/lib/server/orcamentos";
import { buscarProdutosSimilar } from "@/lib/server/busca-similar";
import { centavosParaReais } from "@/lib/utils/money";
import { EMPRESA } from "@/lib/constants/empresa";

const MODELO = "claude-sonnet-5";

// ---------------------------------------------------------------------------
// Agente de atendimento/vendas — lê a conversa de WhatsApp de um cliente e
// redige uma SUGESTÃO de resposta. Diferente do agente de comando
// (lib/server/agente.ts), esse nunca executa nada sozinho: o texto volta pro
// componente do Composer no Atendimento, o Marcos ou a Dani revisam, editam
// se quiserem e só então mandam pelo mesmo caminho de envio manual de
// sempre. Supervisão é o próprio fluxo de UI, não precisa de confirmação
// separada como as ferramentas sensíveis do outro agente.
// ---------------------------------------------------------------------------

type ArgsFerramenta = Record<string, unknown>;

const FERRAMENTA_BUSCAR_PRODUTOS: Anthropic.Tool = {
  name: "buscar_produtos",
  description: "Busca produtos do catálogo da Legaus Kids por nome ou código, pra confirmar preço/detalhes antes de sugerir uma resposta sobre um produto específico.",
  input_schema: {
    type: "object",
    properties: { termo: { type: "string" } },
    required: ["termo"],
  },
};

async function executarBuscarProdutos(args: ArgsFerramenta): Promise<unknown> {
  const { termo } = args as { termo: string };
  const produtos = await buscarProdutosSimilar(termo, 5);
  return produtos.length > 0
    ? produtos.map((p) => ({
        nome: p.nome,
        codigo: p.codigo,
        categoria: p.categoria,
        valor: p.valorCentavos != null ? centavosParaReais(p.valorCentavos) : "sem valor cadastrado",
      }))
    : "Nenhum produto encontrado com esse nome.";
}

function montarSystemPrompt(): string {
  return `Você é uma especialista sênior em atendimento ao cliente e vendas da ${EMPRESA.nomeFantasia}, fabricante de playgrounds e parques infantis (${EMPRESA.site}). Tem décadas de experiência em vendas consultivas: sabe qualificar um lead, apresentar produto de um jeito que resolve o problema de quem pergunta, conduzir negociação com naturalidade, contornar objeção sem soar forçada, e fechar.

Sua função aqui: ler a conversa de WhatsApp entre a ${EMPRESA.nomeFantasia} e um cliente/lead, e REDIGIR UMA SUGESTÃO da próxima resposta. Você NÃO manda nada direto pro cliente — o Marcos ou a Dani revisam sua sugestão, editam se quiserem, e decidem se enviam. Escreva como se fosse você mesma respondendo, na primeira pessoa da empresa ("nós", "aqui na ${EMPRESA.nomeFantasia}").

Regras:
- Português do Brasil, tom caloroso e profissional, natural — como uma pessoa de verdade escreve no WhatsApp, não como um robô institucional. Frases curtas, direto ao ponto.
- Formate como WhatsApp: *asterisco simples* pra negrito (nunca **duplo**), sem markdown de título, sem tabela.
- Só afirme preço, prazo ou especificação técnica de produto que você confirmou com a ferramenta buscar_produtos ou que já apareceu na própria conversa — nunca invente número.
- Você recebe notas internas e o histórico de negócios/orçamentos do cliente como contexto de bastidor — isso é só pra você entender a situação, nunca repita uma nota interna literalmente pro cliente como se ele pudesse vê-la.
- Se o cliente perguntou algo que você não tem informação segura pra responder, redija a sugestão reconhecendo e propondo o próximo passo (ex: "vou confirmar com nossa equipe e te retorno ainda hoje"), em vez de arriscar um chute.
- Seja proativa: quando fizer sentido no fluxo da conversa, sugira o próximo passo natural (mandar orçamento, agendar visita, perguntar sobre o espaço/quantidade de crianças, etc.) — não responda só a última mensagem isolada, pense na conversa inteira.
- Responda só com o texto da sugestão, pronto pra colar no campo de mensagem — sem explicações tipo "aqui está a sugestão:", sem aspas envolvendo o texto todo.`;
}

/** Gera uma sugestão de resposta pra próxima mensagem de uma conversa do Atendimento. */
export async function gerarSugestaoResposta(conversaId: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("O agente de atendimento ainda não está configurado (falta a chave da Anthropic no servidor).");
  }

  const conversa = await getConversaDetalhada(conversaId);
  if (!conversa) throw new Error("Conversa não encontrada.");
  if (conversa.mensagens.length === 0) throw new Error("Essa conversa ainda não tem nenhuma mensagem — nada pra responder ainda.");

  const [negocios, todosOrcamentos] = await Promise.all([
    listNegociosPorContato(conversa.contatoId),
    listarOrcamentos(),
  ]);
  const orcamentosDoCliente = todosOrcamentos.filter((o) => o.contatoId === conversa.contatoId).slice(0, 5);

  const contexto = `
Cliente: ${conversa.contato.nome}${conversa.contato.empresa ? ` (${conversa.contato.empresa})` : ""}
Tags: ${conversa.contato.tags.length > 0 ? conversa.contato.tags.join(", ") : "nenhuma"}
Negócios em andamento: ${negocios.length === 0 ? "nenhum" : negocios.map((n) => `${n.titulo} — etapa ${n.etapa.nome} (${n.funil.nome}), ${centavosParaReais(n.valorCentavos)}`).join("; ")}
Orçamentos do cliente: ${orcamentosDoCliente.length === 0 ? "nenhum" : orcamentosDoCliente.map((o) => `#${String(o.numero).padStart(4, "0")} — ${o.status}`).join("; ")}
Notas internas sobre o cliente: ${conversa.notas.length === 0 ? "nenhuma" : conversa.notas.slice(0, 5).map((n) => `- ${n.texto}`).join("\n")}

Histórico da conversa (da mais antiga pra mais recente):
${conversa.mensagens.map((m) => `[${m.direcao === "ENTRADA" ? "Cliente" : EMPRESA.nomeFantasia}] ${m.texto}`).join("\n")}
`.trim();

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `${contexto}\n\nRedija a sugestão da próxima resposta pro cliente.` },
  ];

  for (let turno = 0; turno < 3; turno++) {
    const resposta = await client.messages.create({
      model: MODELO,
      max_tokens: 700,
      system: montarSystemPrompt(),
      tools: [FERRAMENTA_BUSCAR_PRODUTOS],
      messages,
    });

    messages.push({ role: "assistant", content: resposta.content });

    const usosDeFerramenta = resposta.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (usosDeFerramenta.length === 0) {
      const texto = resposta.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (!texto) throw new Error("Não consegui gerar uma sugestão dessa vez.");
      return texto;
    }

    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const uso of usosDeFerramenta) {
      const resultado = await executarBuscarProdutos(uso.input as ArgsFerramenta);
      resultados.push({ type: "tool_result", tool_use_id: uso.id, content: JSON.stringify(resultado) });
    }
    messages.push({ role: "user", content: resultados });
  }

  throw new Error("Não consegui gerar uma sugestão dessa vez — tenta de novo.");
}
