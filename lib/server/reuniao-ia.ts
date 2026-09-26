import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { centavosParaReais } from "@/lib/utils/money";
import { sinaisDeAtencao, type ResumoReuniao } from "@/lib/utils/reuniao";
import {
  getReuniao,
  getReuniaoAnteriorEncerrada,
  montarResumoReuniao,
  trazerPendentesDaAnterior,
  type ReuniaoDetalhada,
} from "@/lib/server/reunioes";

// IA do painel de reunião (pedido de 2026-09-25): na véspera, o CRM monta
// uma SUGESTÃO de pauta a partir dos números, dos sinais de atenção, dos
// compromissos em aberto e da avaliação da reunião anterior — cada item já
// com a pergunta pra equipe opinar antes. Ao encerrar, avalia o que foi
// tratado; essa avaliação entra na pauta da próxima, fechando o ciclo.
// Só roda sob demanda (botão ou pedido no WhatsApp), nunca sozinha.

const MODELO = "claude-sonnet-5";

/** Erro com mensagem já pronta pro usuário (os da API da Anthropic passam por mensagemErroAnthropic). */
export class ErroReuniaoIa extends Error {}
const MAX_ITENS_SUGERIDOS = 8;

function clienteAnthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ErroReuniaoIa("A IA ainda não está configurada (falta a chave da Anthropic no servidor).");
  return new Anthropic({ apiKey });
}

function dataHora(d: Date): string {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function dia(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
}

/** Paineis que a IA pode ligar a um item da pauta (chave → caminho). */
function catalogoLinks(resumo: ResumoReuniao): Record<string, { href: string; descricao: string }> {
  const l = resumo.links;
  return {
    funil_venda: { href: l.funilVenda, descricao: "quadro do funil de venda (negociação, fechamento)" },
    negocios_parados: { href: l.parados, descricao: "negócios parados além do prazo da etapa" },
    pos_venda: { href: l.funilPosVenda, descricao: "funil de pós-venda (contrato, pagamento, compras, produção, entrega)" },
    tarefas_atrasadas: { href: l.tarefasAtrasadas, descricao: "tarefas atrasadas" },
    aprovacoes: { href: l.aprovacoes, descricao: "tarefas aguardando aprovação" },
    financeiro: { href: l.financeiro, descricao: "dashboard financeiro (entradas, saídas, resultado, centros de custo, projetos)" },
    conciliacao: { href: l.conciliacao, descricao: "conciliação bancária (classificar lançamentos)" },
    producao: { href: l.producao, descricao: "produção e calendário de instalações" },
    atendimento: { href: l.atendimento, descricao: "atendimento/WhatsApp (leads e conversas)" },
    dashboard: { href: l.dashboard, descricao: "dashboard geral (meta do mês, equipe)" },
    compromissos: { href: "#compromissos", descricao: "compromissos das reuniões (nesta mesma página)" },
  };
}

function textoResumo(r: ResumoReuniao): string {
  const neg = (itens: ResumoReuniao["vendas"]["ganhos"]["itens"]) =>
    itens.length === 0 ? "" : `\n${itens.map((n) => `  - ${n.titulo}${n.contatoNome ? ` (${n.contatoNome})` : ""}: ${centavosParaReais(n.valorCentavos)}${n.detalhe ? ` — ${n.detalhe}` : ""}`).join("\n")}`;
  const linhas = [
    `PERÍODO ANALISADO: ${r.periodo.rotulo}`,
    `- Negócios ganhos: ${r.vendas.ganhos.qtd} (${centavosParaReais(r.vendas.ganhos.valorCentavos)})${neg(r.vendas.ganhos.itens)}`,
    `- Negócios perdidos: ${r.vendas.perdidos.qtd} (${centavosParaReais(r.vendas.perdidos.valorCentavos)})${neg(r.vendas.perdidos.itens)}`,
    `- Negócios novos no funil de venda: ${r.vendas.novosNegocios.qtd} (${centavosParaReais(r.vendas.novosNegocios.valorCentavos)})`,
    `- Leads: ${r.vendas.leads.conversasNovas} conversas novas iniciadas por clientes no WhatsApp, ${r.vendas.leads.contatosNovos} contatos cadastrados`,
    `- Caixa (extratos): entradas ${centavosParaReais(r.financeiro.entradasCentavos)}, saídas ${centavosParaReais(r.financeiro.saidasCentavos)}, resultado ${centavosParaReais(r.financeiro.resultadoCentavos)}; ${r.financeiro.aClassificarQtd} lançamentos ainda sem projeto/centro de custo; último lançamento importado: ${r.financeiro.ultimoLancamento ? dia(r.financeiro.ultimoLancamento) : "nenhum"}`,
    `- Tarefas concluídas: ${r.tarefas.concluidasNoPeriodo}; compromissos de reunião concluídos: ${r.compromissos.concluidosNoPeriodo}`,
    r.meta
      ? `- Meta de ${r.meta.rotuloMes}: ${centavosParaReais(r.meta.ganhoCentavos)} de ${centavosParaReais(r.meta.alvoCentavos)} (${r.meta.percentualAtingido}% atingido, ${r.meta.percentualDoMes}% do mês decorrido)`
      : "- Sem meta cadastrada pro mês",
    "",
    "SITUAÇÃO AGORA:",
    `- Funil de venda em aberto: ${r.pipeline.emNegociacao.qtd} negócios (${centavosParaReais(r.pipeline.emNegociacao.valorCentavos)}); por etapa: ${r.pipeline.etapas.map((e) => `${e.nome} ${e.qtd} (${centavosParaReais(e.valorCentavos)})`).join(", ")}`,
    `- Em fechamento: ${r.pipeline.emFechamento.qtd} (${centavosParaReais(r.pipeline.emFechamento.valorCentavos)})${neg(r.pipeline.emFechamento.itens)}`,
    `- Parados além do prazo da etapa: ${r.pipeline.parados.qtd} (${centavosParaReais(r.pipeline.parados.valorCentavos)})${neg(r.pipeline.parados.itens)}`,
    `- Com previsão de fechamento já vencida: ${r.pipeline.previsaoVencida.qtd}${neg(r.pipeline.previsaoVencida.itens)}`,
    `- Pós-venda: ${r.posVenda.etapas.map((e) => `${e.nome} ${e.qtd}`).join(", ")}; em Pagamento: ${r.posVenda.emPagamento.qtd} (${centavosParaReais(r.posVenda.emPagamento.valorCentavos)})`,
    `- Tarefas atrasadas: ${r.tarefas.atrasadas}; aguardando aprovação: ${r.tarefas.aprovacoesPendentes}`,
    "",
    `PERSPECTIVA (${r.proximo.rotulo}):`,
    `- Fechamentos previstos: ${r.perspectiva.fechamentosPrevistos.qtd} (${centavosParaReais(r.perspectiva.fechamentosPrevistos.valorCentavos)})${neg(r.perspectiva.fechamentosPrevistos.itens)}`,
    `- Negócios em fechamento sem data prevista: ${r.perspectiva.emFechamentoSemPrevisao}`,
    `- Instalações: ${r.perspectiva.instalacoes.qtd}${neg(r.perspectiva.instalacoes.itens)}`,
    `- Produção com previsão de término: ${r.perspectiva.producaoPrevista.qtd}${neg(r.perspectiva.producaoPrevista.itens)}`,
    `- Tarefas com prazo no período: ${r.perspectiva.tarefasComPrazo}; compromissos vencendo: ${r.perspectiva.compromissosVencendo}`,
    r.perspectiva.metaProximoMesCentavos !== null ? `- Meta do próximo mês: ${centavosParaReais(r.perspectiva.metaProximoMesCentavos)}` : "",
  ];
  return linhas.filter((l) => l !== "").join("\n");
}

function textoCompromissos(r: ResumoReuniao): string {
  if (r.compromissos.abertos.length === 0) return "Nenhum compromisso de reunião em aberto.";
  return r.compromissos.abertos
    .map((c) => `- ${c.titulo} — ${c.responsavelNome}, até ${dia(c.prazo)}${c.atrasado ? " (ATRASADO)" : ""}${c.reuniaoTitulo ? ` [${c.reuniaoTitulo}]` : ""}`)
    .join("\n");
}

type ItemSugerido = { titulo: string; descricao: string; pergunta: string; link: string };

/**
 * Gera (ou regenera) a pauta sugerida. Substitui só os itens SUGERIDOS que
 * ainda não foram mexidos (sem opinião, sem decisão, pendentes) — itens
 * manuais, trazidos da reunião anterior ou já comentados ficam.
 */
export async function gerarPautaSugerida(reuniaoId: string): Promise<{ itensCriados: number }> {
  const inicial = await prisma.reuniao.findUnique({ where: { id: reuniaoId }, select: { status: true } });
  if (!inicial) throw new ErroReuniaoIa("Reunião não encontrada.");
  if (inicial.status === "ENCERRADA") throw new ErroReuniaoIa("Essa reunião já foi encerrada — reabra pra mexer na pauta.");
  // A anterior pode ter sido encerrada depois que esta foi criada.
  await trazerPendentesDaAnterior(reuniaoId);
  const reuniao = (await getReuniao(reuniaoId))!;

  const [resumo, anterior] = await Promise.all([montarResumoReuniao(reuniao), getReuniaoAnteriorEncerrada(reuniao.data, reuniao.id)]);
  const sinais = sinaisDeAtencao(resumo);
  const links = catalogoLinks(resumo);
  const substituiveis = reuniao.itensPauta.filter((i) => i.origem === "SUGERIDO" && i.status === "PENDENTE" && !i.decisao && i.opinioes.length === 0);
  const mantidos = reuniao.itensPauta.filter((i) => !substituiveis.includes(i));

  const contexto = [
    `Reunião ${reuniao.tipo === "SEMANAL" ? "semanal" : "mensal"} de acompanhamento e gestão: "${reuniao.titulo}", ${dataHora(reuniao.data)}.`,
    "",
    textoResumo(resumo),
    "",
    "SINAIS DE ATENÇÃO LEVANTADOS PELO CRM (do mais urgente pro informativo):",
    sinais.length === 0 ? "- nenhum" : sinais.map((s) => `- [${s.nivel}] ${s.titulo}${s.detalhe ? ` — ${s.detalhe}` : ""}`).join("\n"),
    "",
    "COMPROMISSOS FIRMADOS EM REUNIÕES E AINDA EM ABERTO:",
    textoCompromissos(resumo),
    "",
    anterior
      ? `REUNIÃO ANTERIOR ("${anterior.titulo}", ${dataHora(anterior.data)}):\nItens tratados: ${
          anterior.itensPauta.map((i) => `\n- ${i.titulo} [${i.status}]${i.decisao ? ` → decisão: ${i.decisao}` : ""}`).join("") || " nenhum"
        }\nAvaliação registrada:\n${anterior.avaliacao ?? "(sem avaliação)"}`
      : "REUNIÃO ANTERIOR: nenhuma encerrada ainda — esta é a primeira do ciclo.",
    "",
    "ITENS QUE JÁ ESTÃO NA PAUTA (não repita):",
    mantidos.length === 0 ? "- nenhum" : mantidos.map((i) => `- ${i.titulo}${i.origem === "PENDENTE_ANTERIOR" ? " (veio pendente da reunião anterior)" : ""}`).join("\n"),
  ].join("\n");

  const system = `Você prepara a pauta das reuniões de gestão da Legaus Kids (fabricante de playgrounds e parques infantis, equipe pequena: Marcos, o dono, e a Dani). A reunião precisa ser curta e produtiva, com pautas bem definidas que terminem em decisões com dono e prazo.

Monte de 4 a ${MAX_ITENS_SUGERIDOS} itens, do mais importante pro menos importante, cobrindo nesta ordem de prioridade:
1. Acompanhamento dos compromissos atrasados ou vencendo (cobrar status, não repetir a lista inteira — agrupe).
2. O que a avaliação da reunião anterior mandou acompanhar, e itens sem decisão.
3. Os sinais de atenção de prioridade alta e média que pedem uma decisão.
4. Perspectiva do próximo período: fechamentos previstos (quais negócios, quanto, o que falta pra fechar), instalações/produção, caixa.
Não crie item só pra repetir número sem decisão a tomar. Junte assuntos relacionados num item só.

Cada item:
- titulo: assunto curto (até ~70 caracteres), claro fora de contexto.
- descricao: 1 a 3 frases com os números concretos que estão nos dados (nunca invente número, cliente ou prazo) e o que precisa ser decidido.
- pergunta: a pergunta objetiva pra equipe opinar ANTES da reunião (ex.: "Vale dar desconto de 5% pra fechar o Parque X ainda este mês?").
- link: a chave do painel do CRM que ajuda a analisar o item a fundo durante a reunião, ou "nenhum".

Paineis disponíveis: ${Object.entries(links).map(([k, v]) => `${k} = ${v.descricao}`).join("; ")}.

Português do Brasil, direto. Registre a pauta com a ferramenta registrar_pauta.`;

  const resposta = await clienteAnthropic().messages.create({
    model: MODELO,
    max_tokens: 2500,
    system,
    tools: [
      {
        name: "registrar_pauta",
        description: "Registra a pauta sugerida da reunião.",
        input_schema: {
          type: "object",
          properties: {
            itens: {
              type: "array",
              maxItems: MAX_ITENS_SUGERIDOS,
              items: {
                type: "object",
                properties: {
                  titulo: { type: "string" },
                  descricao: { type: "string" },
                  pergunta: { type: "string" },
                  link: { type: "string", enum: [...Object.keys(links), "nenhum"] },
                },
                required: ["titulo", "descricao", "pergunta", "link"],
              },
            },
          },
          required: ["itens"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "registrar_pauta" },
    messages: [{ role: "user", content: contexto }],
  });

  const uso = resposta.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const itens = ((uso?.input as { itens?: ItemSugerido[] } | undefined)?.itens ?? [])
    .filter((i) => i && typeof i.titulo === "string" && i.titulo.trim())
    .slice(0, MAX_ITENS_SUGERIDOS);
  if (itens.length === 0) throw new ErroReuniaoIa("A IA não devolveu nenhum item de pauta dessa vez — tenta de novo.");

  const ordemInicial = mantidos.reduce((max, i) => Math.max(max, i.ordem), -1) + 1;
  await prisma.$transaction([
    prisma.itemPauta.deleteMany({ where: { id: { in: substituiveis.map((i) => i.id) } } }),
    ...itens.map((i, idx) =>
      prisma.itemPauta.create({
        data: {
          reuniaoId,
          ordem: ordemInicial + idx,
          titulo: i.titulo.trim().slice(0, 200),
          descricao: [i.descricao?.trim(), i.pergunta?.trim() ? `Pra opinar: ${i.pergunta.trim()}` : ""].filter(Boolean).join("\n"),
          origem: "SUGERIDO",
          link: links[i.link]?.href ?? null,
        },
      }),
    ),
    prisma.reuniao.update({ where: { id: reuniaoId }, data: { pautaGeradaEm: new Date() } }),
  ]);
  return { itensCriados: itens.length };
}

function textoDaReuniao(reuniao: ReuniaoDetalhada): string {
  const pauta = reuniao.itensPauta
    .map((i, idx) => {
      const opinioes = i.opinioes.map((o) => `\n    opinião de ${o.autor.nome}: ${o.texto}`).join("");
      return `${idx + 1}. ${i.titulo} [${i.status === "DISCUTIDO" ? "discutido" : i.status === "ADIADO" ? "adiado" : "não discutido"}]${i.descricao ? `\n    contexto: ${i.descricao.replace(/\n/g, " ")}` : ""}${opinioes}${i.decisao ? `\n    DECISÃO: ${i.decisao}` : ""}`;
    })
    .join("\n");
  const compromissos = reuniao.compromissos
    .map((c) => `- ${c.titulo} — ${c.responsavel.nome}, até ${c.prazo.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}${c.status === "CONCLUIDA" ? " (já concluído)" : ""}`)
    .join("\n");
  return [
    `Reunião: "${reuniao.titulo}" (${reuniao.tipo === "SEMANAL" ? "semanal" : "mensal"}), ${dataHora(reuniao.data)}.`,
    "",
    "PAUTA:",
    pauta || "(sem itens)",
    "",
    "COMPROMISSOS FIRMADOS NESTA REUNIÃO (o quê — quem — quando):",
    compromissos || "(nenhum)",
    "",
    "ANOTAÇÕES / ATA:",
    reuniao.anotacoes?.trim() || "(sem anotações)",
  ].join("\n");
}

/** Avaliação do que foi tratado — gravada em Reuniao.avaliacao e usada na pauta da próxima. */
export async function gerarAvaliacaoReuniao(reuniaoId: string): Promise<string> {
  const reuniao = await getReuniao(reuniaoId);
  if (!reuniao) throw new ErroReuniaoIa("Reunião não encontrada.");
  const resumo = (reuniao.resumoEncerramento as ResumoReuniao | null) ?? (await montarResumoReuniao(reuniao));
  const compromissosDeOutras = { ...resumo, compromissos: { ...resumo.compromissos, abertos: resumo.compromissos.abertos.filter((c) => c.reuniaoId !== reuniao.id) } };

  const contexto = [
    textoDaReuniao(reuniao),
    "",
    "NÚMEROS VISTOS NA REUNIÃO:",
    textoResumo(resumo),
    "",
    "COMPROMISSOS DE REUNIÕES ANTERIORES AINDA EM ABERTO:",
    textoCompromissos(compromissosDeOutras),
  ].join("\n");

  const system = `Você avalia as reuniões de gestão da Legaus Kids (fabricante de playgrounds; equipe: Marcos, o dono, e a Dani) pra que cada reunião alimente a próxima. Escreva em português do Brasil, texto simples (sem markdown: nada de #, ** ou tabelas; use títulos em MAIÚSCULAS e listas com "- "), curto e objetivo, com estas seções:

DECIDIDO — cada decisão tomada, em uma linha.
COMPROMISSOS — o quê, quem e até quando (aponte compromisso sem responsável claro ou sem prazo).
FICOU EM ABERTO — itens adiados ou sem decisão, e compromissos antigos ainda pendentes que não foram cobrados.
ATENÇÃO NA PRÓXIMA REUNIÃO — de 3 a 5 pontos que precisam voltar à pauta ou ser acompanhados, com o número que justifica.
NOTA DA REUNIÃO — de 0 a 10 (pauta cumprida, decisões com dono e prazo, compromissos antigos cobrados) e uma frase dizendo o que melhorar.

Use só o que está nos dados; não invente decisão, número ou prazo. Seja enxuto: uma linha por ponto.`;

  const resposta = await clienteAnthropic().messages.create({
    model: MODELO,
    max_tokens: 3000,
    system,
    messages: [{ role: "user", content: contexto }],
  });
  if (resposta.stop_reason === "max_tokens") throw new ErroReuniaoIa("A avaliação veio cortada pela IA — tenta de novo.");
  const texto = resposta.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!texto) throw new ErroReuniaoIa("A IA não devolveu a avaliação dessa vez — tenta de novo.");
  await prisma.reuniao.update({ where: { id: reuniaoId }, data: { avaliacao: texto } });
  return texto;
}
