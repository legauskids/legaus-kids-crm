import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { mensagemErroAnthropic } from "@/lib/utils/anthropic-erro";
import {
  SO_STORY,
  atualizarLegendaPostagem,
  atualizarTextosPostagem,
  buscarFotoDoPost,
  imagemDaArte,
  salvarDadosArte,
  textosDaPostagem,
} from "@/lib/server/marketing";
import { aplicarAjuste, resumoDasArtes, type AjusteArte, type FotoParaAssistente } from "@/lib/utils/marketing-agente";
import { ROTULO_CONTEUDO, type DadosArte, type FormatoArte } from "@/lib/utils/postagem-arte";

// Assistente do Marketing (pedido do Marcos de 2026-10-20): o Claude dentro
// de cada post — conversa, OLHA as artes (imagens desenhadas pelo servidor)
// e faz os ajustes pedidos (título, selos, logo, enquadramento, troca de
// foto, legenda). Cada ajuste passa pela mesma conferência do editor
// (sanitizarDadosArte). Não aprova nem publica: isso é do Marcos.
// A conversa fica em ComandoAgente (origem CRM_TEXTO, identificador
// "marketing:<postId>") — sem tabela nova.

const MODELO = "claude-sonnet-5";
const MAX_TURNOS = 8;
/** A Vercel corta em 60 s: passou disso, para e avisa. */
const PRAZO_MS = 48_000;
const MAX_IMAGENS_POR_VEZ = 4;

export function identificadorDoPost(postagemId: string): string {
  return `marketing:${postagemId}`;
}

export async function historicoDoAssistente(postagemId: string, limite = 40) {
  const linhas = await prisma.comandoAgente.findMany({
    where: { identificador: identificadorDoPost(postagemId) },
    orderBy: { criadoEm: "desc" },
    take: limite,
    select: { id: true, textoComando: true, resposta: true, criadoEm: true, usuario: { select: { nome: true } } },
  });
  return linhas.reverse();
}

const SISTEMA = `Você é o Claude, assistente de marketing dentro do CRM da Legaus Kids (fábrica de playgrounds e brinquedos infantis). Você ajuda o Marcos a deixar um post do Instagram pronto: ajusta as artes (título, selos, logo, enquadramento e escolha das fotos) e a legenda. Fale em português do Brasil, curto e direto.

Regras da marca (inegociáveis):
1. A logo e as cores nunca mudam. A logo só muda de tamanho e de posição e nunca sai da arte.
2. Só as cores da marca. Título: linha pequena verde-azulada, linha grande laranja. Selos: laranja (texto branco) ou branco (texto verde-azulado), com ícone de check ou de localização (pino — use icone "local" pra local da obra, ex.: "Bob's Vacaria").
3. Só fotos reais: você não cria nem edita imagem — só escolhe, enquadra e dá zoom nas fotos do próprio post.
4. Todo título, frase e selo começa com letra maiúscula.
5. No máximo 3 informações por imagem: o título e 2 selos.
6. Story: nada importante nos 250 px de cima nem nos 250 px de baixo (botões do Instagram).
7. Não invente fatos (cliente, cidade, preço, itens) — nem na arte, nem na legenda.

Coordenadas, em pixels da arte (feed 1080×1350, story 1080×1920): x da esquerda pra direita, y de cima pra baixo. Título e selos: x,y = canto de cima à esquerda. O título padrão do feed tem ≈ 230 px de altura (linhas de 58 e 100 px, escala 1); o do story ≈ 260 px. Selo: altura = 2 × tam. Logo: cx = centro horizontal, base = borda de baixo, larg = largura (altura ≈ 0,64 × larg). Foto: fx/fy = ponto focal (0 = mostra a esquerda/o topo, 1 = a direita/a base), zoom de 1 (foto inteira cobrindo a caixa) a 4.

Como trabalhar:
- Só mude alguma coisa quando o Marcos pedir uma mudança. Se ele só perguntar ou pedir opinião ("o que acha?", "está bom?", "me diz se..."), olhe, responda e sugira — sem alterar nada; ele decide.
- O estado das artes vem no fim destas instruções (já com o que você mudou nesta conversa), e cada ajustar_arte diz o ANTES → DEPOIS de cada mudança: é isso que aconteceu, o ajuste foi aplicado. Conte ao Marcos com base nesse antes → depois. Nunca repita um ajuste achando que "não pegou", e não conclua pela imagem se algo se moveu — a imagem pequena engana; ela serve pra ver composição, corte e sobreposição.
- Medida pedida é medida aplicada: "desce uns 100 px" = dy 100, uma vez. Não aumente nem acrescente por conta própria.
- Título e selos são um bloco: mover ou aumentar o título já leva os selos de baixo junto, mantendo o espaço. Não mova os selos separadamente depois disso (só com soTitulo:true o título anda sozinho).
- Antes de opinar sobre composição (título em cima do brinquedo, foto mal enquadrada, logo pequena), use ver_artes pra OLHAR. Depois de ajustar, olhe pra conferir só se algo pode ter ficado cortado ou sobreposto; se ficou, avise e sugira — não saia mexendo além do pedido.
- Pra mexer, use ajustar_arte; pode aplicar os mesmos ajustes em várias artes de uma vez. Prefira ajustes pontuais a refazer tudo.
- Pra escolher outra foto (ex.: capa), use ver_fotos pra ver as fotos do post e troque com ajustar_arte (elemento foto1, campo foto).
- refazer_artes volta TODAS as artes ao padrão e apaga os ajustes feitos (no editor ou por você) — só quando o Marcos pedir pra recomeçar ou trocar os textos de todas.
- Legenda: gancho → o que foi entregue (só fatos) → chamada "Chama no WhatsApp!" → 4 a 6 hashtags, sempre com #LegausKids #BrincadeiraLevadaASerio. Tom alegre, frases curtas, no máximo 1 ou 2 emojis. Use alterar_legenda com o texto pronto. Story não tem legenda.
- Você não aprova nem publica: quem aprova é o Marcos, no botão Aprovar da tela.
- Resposta final curta: o que você fez (ou sugere) em 1 a 3 frases, sem markdown.`;

const FERRAMENTAS: Anthropic.Tool[] = [
  {
    name: "ver_artes",
    description: "Mostra as artes do post como vão ficar (a imagem final desenhada pelo servidor). Até 4 por vez.",
    input_schema: {
      type: "object",
      properties: { artes: { type: "array", items: { type: "integer" }, description: "Números das artes (1 = capa ou primeira arte)" } },
      required: ["artes"],
    },
  },
  {
    name: "ver_fotos",
    description: "Mostra as fotos do post (numeradas), pra escolher qual usar numa arte.",
    input_schema: { type: "object", properties: { fotos: { type: "array", items: { type: "integer" }, description: "Números das fotos; vazio = todas (até 8)" } } },
  },
  {
    name: "ajustar_arte",
    description:
      "Aplica ajustes em uma ou mais artes. Cada ajuste tem um elemento (titulo, selo1, selo2, logo, foto1, foto2) e os campos que mudam. Posição absoluta (x, y; logo: cx, base) ou relativa (dx, dy, em px da arte). Selo que não existe é criado (com texto). remover:true tira selo ou título (a logo nunca sai).",
    input_schema: {
      type: "object",
      properties: {
        artes: { type: "array", items: { type: "integer" }, description: "Números das artes que recebem os ajustes" },
        ajustes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              elemento: { type: "string", enum: ["titulo", "selo1", "selo2", "logo", "foto1", "foto2"] },
              x: { type: "number" },
              y: { type: "number" },
              dx: { type: "number" },
              dy: { type: "number" },
              escala: { type: "number", description: "Título: tamanho em relação ao padrão (1 = 100%)" },
              linha1: { type: "string", description: "Título: linha pequena (ou o texto do título de uma linha)" },
              linha2: { type: "string", description: "Título: linha grande" },
              texto: { type: "string", description: "Selo: texto" },
              tam: { type: "number", description: "Selo: tamanho da letra (18 a 48)" },
              estilo: { type: "string", enum: ["laranja", "branco"] },
              icone: { type: "string", enum: ["check", "local"], description: "Selo: check (padrão) ou local (pino, pra localização da obra)" },
              larg: { type: "number", description: "Logo: largura (120 a 640)" },
              cx: { type: "number" },
              base: { type: "number" },
              centralizar: { type: "boolean", description: "Logo: centraliza na horizontal" },
              foto: { type: "integer", description: "Foto: número da foto do post a usar" },
              fx: { type: "number" },
              fy: { type: "number" },
              zoom: { type: "number" },
              remover: { type: "boolean" },
              soTitulo: { type: "boolean", description: "Título: move/aumenta só o título, sem levar os selos junto" },
            },
            required: ["elemento"],
          },
        },
      },
      required: ["artes", "ajustes"],
    },
  },
  {
    name: "alterar_legenda",
    description: "Troca a legenda do post pelo texto pronto (seguindo as regras da legenda).",
    input_schema: { type: "object", properties: { legenda: { type: "string" } }, required: ["legenda"] },
  },
  {
    name: "refazer_artes",
    description: "Refaz TODAS as artes no padrão com novos textos de título/selos. Apaga os ajustes feitos. Só se o Marcos pedir pra recomeçar.",
    input_schema: {
      type: "object",
      properties: {
        linha1: { type: "string" },
        linha2: { type: "string" },
        selos: { type: "array", items: { type: "string" }, description: "Até 2 selos" },
      },
    },
  },
];

type Estado = Awaited<ReturnType<typeof carregarEstado>>;

async function carregarEstado(postagemId: string) {
  return prisma.postagem.findUniqueOrThrow({
    where: { id: postagemId },
    select: {
      id: true,
      numero: true,
      conteudo: true,
      produto: true,
      cliente: true,
      cidade: true,
      status: true,
      legenda: true,
      textos: true,
      imagens: { orderBy: { ordem: "asc" }, select: { id: true, largura: true, altura: true } },
      artes: { orderBy: { ordem: "asc" }, select: { id: true, ordem: true, formato: true, dados: true } },
    },
  });
}

function fotosDo(estado: Estado): FotoParaAssistente[] {
  return estado.imagens.map((i) => ({ id: i.id, largura: i.largura ?? 1, altura: i.altura ?? 1 }));
}

function contexto(estado: Estado): string {
  const artes = estado.artes.map((a) => ({ ordem: a.ordem, formato: a.formato as FormatoArte, dados: a.dados as unknown as DadosArte }));
  return [
    `Post #${estado.numero} — ${ROTULO_CONTEUDO[estado.conteudo]}${estado.produto ? ` · ${estado.produto}` : ""}${estado.cliente ? ` · cliente: ${estado.cliente}` : ""}${estado.cidade ? ` · cidade: ${estado.cidade}` : ""} · status: ${estado.status}`,
    `Fotos do post: ${fotosDo(estado).map((f, i) => `${i + 1} (${f.altura > f.largura * 1.05 ? "em pé" : "deitada"})`).join(", ")}`,
    `Artes (estado atual): ${JSON.stringify(resumoDasArtes(artes, fotosDo(estado)))}`,
    SO_STORY.includes(estado.conteudo) ? "Só story: sem legenda." : `Legenda atual:\n${estado.legenda || "(vazia)"}`,
  ].join("\n\n");
}

async function miniatura(buffer: Buffer, largura: number): Promise<string> {
  return (await sharp(buffer).resize({ width: largura, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()).toString("base64");
}

type ConteudoResultado = string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>;

async function executar(nome: string, entrada: Record<string, unknown>, postagemId: string, estado: { atual: Estado }): Promise<{ conteudo: ConteudoResultado; mudou: boolean }> {
  const e = estado.atual;
  if (nome === "ver_artes") {
    const numeros = ((entrada.artes as number[]) ?? []).slice(0, MAX_IMAGENS_POR_VEZ);
    const blocos: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [];
    const imagens = await Promise.all(numeros.map(async (n) => ({ n, arte: e.artes[n - 1] && (await imagemDaArte(e.artes[n - 1].id)) })));
    for (const { n, arte } of imagens) {
      if (!arte) {
        blocos.push({ type: "text", text: `Arte ${n} não existe (o post tem ${e.artes.length}).` });
        continue;
      }
      blocos.push({ type: "text", text: `Arte ${n}:` }, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: await miniatura(arte.buffer, 540) } });
    }
    return { conteudo: blocos.length ? blocos : "Nenhuma arte pedida.", mudou: false };
  }
  if (nome === "ver_fotos") {
    const pedidas = (entrada.fotos as number[] | undefined)?.length ? (entrada.fotos as number[]) : e.imagens.map((_, i) => i + 1);
    const blocos: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [];
    for (const n of pedidas.slice(0, 8)) {
      const foto = e.imagens[n - 1] && (await buscarFotoDoPost(e.imagens[n - 1].id));
      if (!foto) continue;
      blocos.push({ type: "text", text: `Foto ${n}:` }, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: await miniatura(foto.buffer, 400) } });
    }
    return { conteudo: blocos.length ? blocos : "Nenhuma foto.", mudou: false };
  }
  if (nome === "ajustar_arte") {
    const numeros = (entrada.artes as number[]) ?? [];
    const ajustes = (entrada.ajustes as AjusteArte[]) ?? [];
    const linhas: string[] = [];
    let mudou = false;
    for (const n of numeros) {
      const arte = e.artes[n - 1];
      if (!arte) {
        linhas.push(`Arte ${n}: não existe.`);
        continue;
      }
      let dados = arte.dados as unknown as DadosArte;
      const feitos: string[] = [];
      for (const a of ajustes) {
        const r = aplicarAjuste(dados, arte.formato as FormatoArte, a, fotosDo(e));
        if (r.ok) {
          dados = r.dados;
          feitos.push(r.feito);
        } else feitos.push(`não deu (${r.erro})`);
      }
      if (feitos.some((f) => !f.startsWith("não deu"))) {
        await salvarDadosArte(arte.id, dados);
        mudou = true;
      }
      linhas.push(`Arte ${n}: ${feitos.join("; ")}.`);
    }
    if (mudou) estado.atual = await carregarEstado(postagemId);
    return { conteudo: `${linhas.join("\n")}\nEstado novo: ${JSON.stringify(resumoDasArtes(estado.atual.artes.map((a) => ({ ordem: a.ordem, formato: a.formato as FormatoArte, dados: a.dados as unknown as DadosArte })), fotosDo(estado.atual)))}`, mudou };
  }
  if (nome === "alterar_legenda") {
    if (SO_STORY.includes(e.conteudo)) return { conteudo: "Esse post é só story — não tem legenda.", mudou: false };
    const legenda = String(entrada.legenda ?? "").trim();
    if (!legenda) return { conteudo: "Legenda vazia — nada mudou.", mudou: false };
    await atualizarLegendaPostagem(postagemId, legenda);
    estado.atual = await carregarEstado(postagemId);
    return { conteudo: "Legenda trocada.", mudou: true };
  }
  if (nome === "refazer_artes") {
    const atuais = textosDaPostagem(e);
    const selos = Array.isArray(entrada.selos) ? (entrada.selos as string[]).slice(0, 2) : atuais.selos;
    const n = await atualizarTextosPostagem(postagemId, {
      ...atuais,
      titulo: [String(entrada.linha1 ?? atuais.titulo[0]), String(entrada.linha2 ?? atuais.titulo[1])],
      selos,
    });
    estado.atual = await carregarEstado(postagemId);
    return { conteudo: `Refiz as ${n} artes no padrão.`, mudou: true };
  }
  return { conteudo: `Ferramenta desconhecida: ${nome}`, mudou: false };
}

function resumoEntrada(entrada: unknown): string {
  const t = JSON.stringify(entrada);
  return t.length > 400 ? `${t.slice(0, 400)}…` : t;
}

/** Uma mensagem do Marcos pro assistente do post: responde e, se for o caso, ajusta as artes. */
export async function conversarSobrePost(input: {
  postagemId: string;
  usuarioId: string;
  texto: string;
  /** Chamado de dentro de outro agente (Telegram), que divide os mesmos 60 s: prazo menor. */
  prazoMs?: number;
}): Promise<{ resposta: string; mudou: boolean }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { resposta: "O assistente está sem a chave da IA configurada.", mudou: false };
  const inicio = Date.now();
  const estado = { atual: await carregarEstado(input.postagemId) };
  const historico = await historicoDoAssistente(input.postagemId, 12);

  const mensagens: Anthropic.MessageParam[] = [];
  for (const h of historico) {
    mensagens.push({ role: "user", content: h.textoComando });
    if (h.resposta) mensagens.push({ role: "assistant", content: h.resposta });
  }
  mensagens.push({ role: "user", content: input.texto });

  const client = new Anthropic({ apiKey });
  const acoes: { ferramenta: string; entrada: string; ok: boolean }[] = [];
  let mudou = false;
  let tokensEntrada = 0;
  let tokensSaida = 0;
  let resposta = "";

  try {
    for (let turno = 0; turno < MAX_TURNOS; turno++) {
      const r = await client.messages.create({
        model: MODELO,
        max_tokens: 1200,
        system: [
          { type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } },
          { type: "text", text: contexto(estado.atual) },
        ],
        tools: FERRAMENTAS,
        messages: mensagens,
      });
      tokensEntrada += r.usage.input_tokens;
      tokensSaida += r.usage.output_tokens;
      const texto = r.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      const usos = r.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (r.stop_reason !== "tool_use" || usos.length === 0) {
        resposta = texto || "Feito.";
        break;
      }
      if (Date.now() - inicio > (input.prazoMs ?? PRAZO_MS)) {
        resposta = `${texto ? `${texto}\n\n` : ""}Parei aqui pra não estourar o tempo — mande "continua" que eu sigo.`;
        break;
      }
      mensagens.push({ role: "assistant", content: r.content });
      const resultados: Anthropic.ToolResultBlockParam[] = [];
      for (const uso of usos) {
        try {
          const res = await executar(uso.name, uso.input as Record<string, unknown>, input.postagemId, estado);
          mudou ||= res.mudou;
          acoes.push({ ferramenta: uso.name, entrada: resumoEntrada(uso.input), ok: true });
          resultados.push({ type: "tool_result", tool_use_id: uso.id, content: res.conteudo });
        } catch (erro) {
          acoes.push({ ferramenta: uso.name, entrada: resumoEntrada(uso.input), ok: false });
          resultados.push({ type: "tool_result", tool_use_id: uso.id, content: `Erro: ${erro instanceof Error ? erro.message : erro}`, is_error: true });
        }
      }
      mensagens.push({ role: "user", content: resultados });
      if (turno === MAX_TURNOS - 1) resposta = texto || "Fiz os ajustes — confira as artes.";
    }
  } catch (erro) {
    resposta = mensagemErroAnthropic(erro);
  }

  await prisma.comandoAgente.create({
    data: {
      origem: "CRM_TEXTO",
      identificador: identificadorDoPost(input.postagemId),
      usuarioId: input.usuarioId,
      textoComando: input.texto,
      resposta,
      acoes: acoes as unknown as Prisma.InputJsonValue,
      tokensEntrada,
      tokensSaida,
    },
  });
  return { resposta, mudou };
}
