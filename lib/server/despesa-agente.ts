import "server-only";
import { prisma } from "@/lib/db";
import type { OrigemDespesa, Prisma } from "@prisma/client";
import { criarDespesa, confirmarDespesa } from "@/lib/server/despesas";
import { diaBrasilia, somarDias } from "@/lib/utils/brasilia";
import { dataDaDespesa, pendenciasDaDespesa } from "@/lib/utils/despesas";
import { semVendaComPosVenda } from "@/lib/utils/negocio-pos-venda";
import {
  OPCAO_CONFIRMAR,
  OPCAO_DESCARTAR,
  OPCAO_NEGOCIO,
  botoesDaDespesa,
  botoesDeCategorias,
  botoesDeCentros,
  botoesDeParecida,
  botoesDeRegistro,
  canalDoIdentificador,
  enqueteDaDespesa,
  mensagemDeConfirmacao,
  mensagemDeRegistro,
  montarDespesaDaMensagem,
  negociosParecidos,
  pareceMesmaDespesa,
  resolverCategoria,
  resolverCentro,
  resolverDataFalada,
  type Enquete,
  type CanalDespesa,
  type ExtracaoDespesa,
} from "@/lib/utils/despesa-agente";
import type { Botoes, PedidoBotao } from "@/lib/utils/agente-canal";

// Agente financeiro do WhatsApp (pedido de 2026-10-07): a parte que mexe no
// banco. As regras (o que é "dito", data falada, registrar direto ou pedir
// confirmação) ficam em lib/utils/despesa-agente.ts, com testes.

/** Rascunho esperando confirmação vale por 30 minutos; depois disso só pela tela. */
const JANELA_RASCUNHO_MS = 30 * 60 * 1000;

/**
 * Texto pro usuário + as escolhas que vão com ele: enquete no WhatsApp,
 * botões no Telegram (o adaptador de cada canal só desenha).
 */
export type RespostaDespesa = { mensagem: string; enquete?: Enquete; botoes?: Botoes };

export async function carregarCadastrosDespesa() {
  const [categorias, centrosGerais, negocios] = await Promise.all([
    prisma.centroCusto.findMany({ where: { tipo: "DESPESA", ativo: true }, orderBy: [{ ordem: "asc" }, { nome: "asc" }] }),
    prisma.centroGeral.findMany({ where: { ativo: true }, orderBy: [{ ordem: "asc" }, { nome: "asc" }] }),
    prisma.negocio.findMany({ select: { id: true, titulo: true, contato: { select: { nome: true } } }, orderBy: { updatedAt: "desc" }, take: 300 }),
  ]);
  return {
    categorias: categorias.map((c) => ({ id: c.id, nome: c.nome, centroGeralPadraoId: c.centroGeralPadraoId, palavrasChave: c.palavrasChave })),
    centrosGerais: centrosGerais.map((g) => ({ id: g.id, nome: g.nome })),
    negocios: semVendaComPosVenda(negocios.map((n) => ({ id: n.id, titulo: n.titulo, contatoNome: n.contato?.nome ?? null }))),
  };
}

export type AnexoDespesa = { bytes: Buffer; mime: string; nome: string | null };

/**
 * Registra a despesa contada na mensagem: direto (aguardando conciliação)
 * quando a regra deixa, senão como rascunho pedindo confirmação ou correção.
 */
export async function registrarDespesaDaMensagem(input: {
  extracao: ExtracaoDespesa;
  texto: string;
  origem: OrigemDespesa;
  identificador: string;
  usuarioId: string;
  anexo?: AnexoDespesa;
}): Promise<RespostaDespesa & { despesaId: string; registradaDireto: boolean }> {
  const hoje = diaBrasilia(new Date());
  const cadastros = await carregarCadastrosDespesa();
  const montada = montarDespesaDaMensagem({ texto: input.texto, origem: input.origem, hoje, extracao: input.extracao, ...cadastros });

  const log = {
    mensagem: input.texto,
    origem: input.origem,
    extraidoPeloModelo: input.extracao,
    decisao: {
      registrarDireto: montada.registrarDireto,
      motivos: montada.motivos,
      categoriaDeclarada: montada.categoriaDeclarada,
      centroDeclarado: montada.centroDeclarado,
      valorNaMensagem: montada.valorNaMensagem,
      fornecedorNaMensagem: montada.fornecedorNaMensagem,
    },
    resolvido: { ...montada.dados, categoria: montada.nomes.categoria, centro: montada.nomes.centro },
    // Atualizado nas correções: se o centro foi dito pela pessoa, corrigir a
    // categoria não mexe nele; se foi deduzido, ele acompanha a categoria.
    centroDeclarado: montada.centroDeclarado,
  };
  console.log(`[despesa-agente] ${input.identificador}: ${JSON.stringify(log)}`);

  // Duplicação vista no 2º teste do Marcos (2026-10-07): com um rascunho
  // esperando, "Kidplay e Jui é o negócio" fez o modelo chamar
  // registrar_despesa de novo (com valor e fornecedor do histórico) e nasceu
  // uma segunda despesa do mesmo gasto. Mesmo gasto do rascunho (ou sem
  // valor nenhum) é complemento dele, nunca despesa nova.
  const rascunho = await buscarRascunhoAtivo(input.identificador);
  if (
    rascunho &&
    (montada.dados.valorCentavos === 0 ||
      pareceMesmaDespesa(montada.dados, { valorCentavos: rascunho.valorCentavos, dia: diaBrasilia(rascunho.data), fornecedor: rascunho.fornecedor }))
  ) {
    const r = await juntarNoRascunho(rascunho, input, montada);
    return { ...r, despesaId: rascunho.id, registradaDireto: false };
  }

  // Igual a uma despesa já registrada (o mesmo comprovante mandado de novo,
  // ou o comprovante de um gasto que já veio por áudio): nunca registra
  // direto, e avisa no resumo.
  const parecida = await buscarDespesaParecida(montada.dados, canalDoIdentificador(input.identificador));
  const registrarDireto = montada.registrarDireto && !parecida;

  const despesa = await criarDespesa({
    ...montada.dados,
    origem: input.origem,
    registradaPorId: input.usuarioId,
    rascunho: !registrarDireto,
    anexo: input.anexo,
    textoOriginal: input.texto,
    extracao: { ...log, parecidaCom: parecida?.id ?? null } as unknown as Prisma.InputJsonValue,
    telefoneOrigem: input.identificador,
  });

  const canal = canalDoIdentificador(input.identificador);
  if (registrarDireto) {
    return {
      mensagem: mensagemDeRegistro(montada, hoje),
      botoes: canal === "telegram" ? botoesDeRegistro(despesa.id) : undefined,
      despesaId: despesa.id,
      registradaDireto: true,
    };
  }
  const diaParecida = parecida ? diaBrasilia(parecida.data).split("-").reverse().slice(0, 2).join("/") : "";
  if (parecida && canal === "telegram") {
    // No Telegram a pergunta vem na frente, com "é a mesma, juntar" / "é outra".
    return {
      mensagem: `⚠️ Parece a mesma despesa já registrada: *${reais(parecida.valorCentavos)}* — ${parecida.fornecedor} (${diaParecida}). É o mesmo gasto?\n\n${mensagemDeConfirmacao(montada, hoje, "A nova:", "crm").split("\n\n")[0]}`,
      botoes: botoesDeParecida(despesa.id, parecida.id),
      despesaId: despesa.id,
      registradaDireto: false,
    };
  }
  const aviso = parecida
    ? `⚠️ Parece a mesma despesa já registrada: *${reais(parecida.valorCentavos)}* — ${parecida.fornecedor} (${diaParecida}). Se for, ${canal === "whatsapp" ? "toque em *Descartar*" : "responda *descartar*"}.\n\n`
    : "";
  return {
    mensagem: aviso + mensagemDeConfirmacao(montada, hoje, undefined, canal),
    enquete: canal === "whatsapp" ? enqueteDaDespesa({ ...despesa, ehProjeto: montada.nomes.centroEhProjeto }) : undefined,
    botoes:
      canal === "telegram"
        ? botoesDaDespesa({
            id: despesa.id,
            ehProjeto: montada.nomes.centroEhProjeto,
            categoria: montada.nomes.categoria,
            categoriaDeduzida: !montada.categoriaDeclarada,
            centro: montada.nomes.centro,
            centroDeduzido: !montada.centroDeclarado,
          })
        : undefined,
    despesaId: despesa.id,
    registradaDireto: false,
  };
}

function reais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");
}

/**
 * Despesa já registrada (não rascunho) que parece ser o mesmo gasto — ver
 * pareceMesmaDespesa. No Telegram entram também as do push do banco (mesmo
 * rascunho): o Pix traz a razão social e o áudio o apelido, então ali basta
 * o mesmo valor perto da data — vira pergunta "é a mesma?", nunca junta
 * sozinho. O WhatsApp (que a Dani vê) nunca mostra despesa vinda do push.
 */
async function buscarDespesaParecida(d: { valorCentavos: number; dia: string; fornecedor: string }, canal: CanalDespesa = "whatsapp") {
  if (d.valorCentavos <= 0) return null;
  const candidatas = await prisma.despesa.findMany({
    where: {
      valorCentavos: d.valorCentavos,
      data: { gte: dataDaDespesa(somarDias(d.dia, -3)), lte: dataDaDespesa(somarDias(d.dia, 3)) },
      OR: [
        { status: { in: ["AGUARDANDO_CONCILIACAO", "CONCILIADA"] }, ...(canal === "telegram" ? {} : { origem: { not: "PUSH" } }) },
        ...(canal === "telegram" ? [{ origem: "PUSH" as const }] : []),
      ],
    },
    select: { id: true, valorCentavos: true, fornecedor: true, data: true, origem: true },
    orderBy: { criadoEm: "desc" },
  });
  return candidatas.find((c) => c.origem === "PUSH" || pareceMesmaDespesa(d, { ...c, dia: diaBrasilia(c.data) })) ?? null;
}

/**
 * Complemento do rascunho esperando confirmação (mesmo gasto contado de
 * novo, ou mensagem sem valor): só entra o que a pessoa DISSE agora
 * (categoria/centro declarados, negócio citado, data falada) ou o que o
 * rascunho ainda não tinha. O comprovante substitui um áudio como arquivo.
 * Nada novo = resposta curta, sem novo resumo nem nova enquete.
 */
async function juntarNoRascunho(
  rascunho: NonNullable<Awaited<ReturnType<typeof buscarRascunhoAtivo>>>,
  input: { extracao: ExtracaoDespesa; texto: string; origem: OrigemDespesa; identificador: string; anexo?: AnexoDespesa },
  montada: ReturnType<typeof montarDespesaDaMensagem>,
): Promise<RespostaDespesa> {
  const d = montada.dados;
  const mudancas: Prisma.DespesaUncheckedUpdateInput = {};
  if (!rascunho.valorCentavos && d.valorCentavos) mudancas.valorCentavos = d.valorCentavos;
  if (!rascunho.fornecedor.trim() && d.fornecedor) mudancas.fornecedor = d.fornecedor;
  if (input.extracao.dataTexto?.trim() && d.dia !== diaBrasilia(rascunho.data)) mudancas.data = dataDaDespesa(d.dia);
  if (d.categoriaId && d.categoriaId !== rascunho.categoriaId && (montada.categoriaDeclarada || !rascunho.categoriaId)) mudancas.categoriaId = d.categoriaId;
  const centroNovo = d.negocioId ?? d.centroGeralId;
  const centroAtual = rascunho.negocioId ?? rascunho.centroGeralId;
  const centroDito = montada.centroDeclarado || montada.nomes.centroEhProjeto;
  if (centroNovo && centroNovo !== centroAtual && (centroDito || !centroAtual)) {
    mudancas.centroGeralId = d.centroGeralId;
    mudancas.negocioId = d.negocioId;
  }
  const trocaArquivo = input.anexo && (!rascunho.anexoMime || (input.origem === "COMPROVANTE" && rascunho.origem !== "COMPROVANTE"));
  if (trocaArquivo && input.anexo) {
    mudancas.anexoBytes = new Uint8Array(input.anexo.bytes);
    mudancas.anexoMime = input.anexo.mime;
    mudancas.anexoNome = input.anexo.nome;
    if (input.origem === "COMPROVANTE") mudancas.origem = "COMPROVANTE";
  }

  const log = (rascunho.extracao ?? {}) as Prisma.JsonObject;
  const complementos = Array.isArray(log.complementos) ? log.complementos : [];
  const mudou = Object.keys(mudancas).length > 0;
  await prisma.despesa.update({
    where: { id: rascunho.id },
    data: {
      ...mudancas,
      textoOriginal: input.texto.trim() ? [rascunho.textoOriginal, input.texto.trim()].filter(Boolean).join("\n\n") : undefined,
      extracao: {
        ...log,
        centroDeclarado: Boolean(log.centroDeclarado) || (mudancas.negocioId !== undefined && centroDito),
        complementos: [...complementos, { mensagem: input.texto, extraidoPeloModelo: input.extracao, mudou, em: new Date().toISOString() }],
      } as Prisma.InputJsonValue,
    },
  });
  console.log(`[despesa-agente] complemento do rascunho ${rascunho.id}: ${JSON.stringify(Object.keys(mudancas))}`);

  if (!mudou) return jaEstaAssim(input.identificador);
  return pedirConfirmacao(rascunho.id, input.identificador, "Atualizei a despesa que estava esperando, confere?");
}

function jaEstaAssim(identificador: string): RespostaDespesa {
  const canal = canalDoIdentificador(identificador);
  return {
    mensagem:
      canal === "whatsapp"
        ? "Já está assim 👍 Confirme na enquete acima ou responda *sim*."
        : canal === "telegram"
          ? "Já está assim 👍 Toque em *Confirmar* acima ou responda *sim*."
          : "Já está assim 👍 Responda *sim* pra confirmar.",
  };
}

/** Rascunho mais recente desse WhatsApp (ou chat do CRM) ainda esperando confirmação. */
export function buscarRascunhoAtivo(identificador: string) {
  return prisma.despesa.findFirst({
    where: { telefoneOrigem: identificador, status: "A_CONFIRMAR", atualizadoEm: { gte: new Date(Date.now() - JANELA_RASCUNHO_MS) } },
    orderBy: { atualizadoEm: "desc" },
  });
}

async function resumoParaMensagem(id: string) {
  const d = await prisma.despesa.findUniqueOrThrow({
    where: { id },
    include: { categoria: { select: { nome: true } }, centroGeral: { select: { nome: true } }, negocio: { select: { titulo: true } } },
  });
  return {
    despesa: d,
    dados: { ...d, dia: diaBrasilia(d.data) },
    nomes: { categoria: d.categoria?.nome ?? null, centro: d.negocio?.titulo ?? d.centroGeral?.nome ?? null, centroEhProjeto: Boolean(d.negocioId) },
    faltando: pendenciasDaDespesa(d),
  };
}

/** O que a pessoa disse (ou escolheu no botão) e o que foi deduzido, pelo log da despesa. */
function declarados(extracao: Prisma.JsonValue | null) {
  const log = (extracao ?? {}) as Prisma.JsonObject;
  const decisao = (log.decisao ?? {}) as Prisma.JsonObject;
  return {
    categoriaDeclarada: Boolean(log.categoriaEscolhida ?? decisao.categoriaDeclarada),
    centroDeclarado: Boolean(log.centroDeclarado ?? decisao.centroDeclarado),
  };
}

/** Resumo de um rascunho + a enquete (WhatsApp) ou os botões (Telegram). */
export async function pedirConfirmacao(id: string, identificador: string, intro?: string): Promise<RespostaDespesa> {
  const r = await resumoParaMensagem(id);
  const canal = canalDoIdentificador(identificador);
  const ditos = declarados(r.despesa.extracao);
  return {
    mensagem: mensagemDeConfirmacao(r, diaBrasilia(new Date()), intro, canal),
    enquete: canal === "whatsapp" ? enqueteDaDespesa({ ...r.despesa, ehProjeto: r.nomes.centroEhProjeto }) : undefined,
    botoes:
      canal === "telegram"
        ? botoesDaDespesa({
            id,
            ehProjeto: r.nomes.centroEhProjeto,
            categoria: r.nomes.categoria,
            categoriaDeduzida: !ditos.categoriaDeclarada,
            centro: r.nomes.centro,
            centroDeduzido: !ditos.centroDeclarado,
          })
        : undefined,
  };
}

/** Texto curto do rascunho pro contexto do modelo (pra entender a correção). */
export async function descreverRascunho(id: string): Promise<string> {
  const r = await resumoParaMensagem(id);
  return mensagemDeConfirmacao(r, diaBrasilia(new Date()), "Despesa esperando confirmação de quem está falando:", "crm").split("\n\n")[0];
}

/** Confirmação (enquete, "sim", "1", áudio): confirma o rascunho e já mostra o próximo, se houver outro esperando. */
export async function confirmarRascunho(id: string, identificador: string): Promise<RespostaDespesa> {
  const hoje = diaBrasilia(new Date());
  const resumo = await resumoParaMensagem(id);
  if (resumo.faltando.length) {
    // No Telegram, o que falta de categoria/centro vem como botões (visto no
    // 1º push real, 08/10: "Confirmar" sem categoria pedia pra digitar).
    if (canalDoIdentificador(identificador) === "telegram") {
      const { categorias, centrosGerais } = await carregarCadastrosDespesa();
      if (resumo.faltando.includes("categoria")) {
        return { mensagem: "Antes de confirmar, escolha a categoria:", botoes: botoesDeCategorias(id, categorias, null) };
      }
      if (resumo.faltando.includes("centro de custo")) {
        return { mensagem: "Antes de confirmar, escolha o centro de custo:", botoes: botoesDeCentros(id, centrosGerais, null) };
      }
    }
    return { mensagem: `Ainda falta: ${resumo.faltando.join(", ")}. Me diga pra eu completar (ex.: "o centro é Produção").` };
  }
  await confirmarDespesa(id);
  const registrado = mensagemDeRegistro(resumo, hoje);
  const proximo = await buscarRascunhoAtivo(identificador);
  if (!proximo) {
    return { mensagem: registrado, botoes: canalDoIdentificador(identificador) === "telegram" ? botoesDeRegistro(id) : undefined };
  }
  const pedido = await pedirConfirmacao(proximo.id, identificador, "Tem mais uma esperando:");
  return { mensagem: `${registrado}\n\n${pedido.mensagem}`, enquete: pedido.enquete, botoes: pedido.botoes };
}

export async function descartarRascunho(id: string): Promise<RespostaDespesa> {
  await prisma.despesa.delete({ where: { id } });
  return { mensagem: "Descartei essa despesa, não registrei nada." };
}

/** "Não" sozinho: não apaga — pergunta o que corrigir. */
export function perguntarOQueCorrigir(): RespostaDespesa {
  return { mensagem: "O que está errado? Me diga o que corrigir (texto ou áudio) — ou responda *descartar* pra apagar." };
}

/**
 * Voto na enquete do WhatsApp (ref "despesa:<id>"), já decifrado pelo
 * whatsapp-service. Só vale pra despesa dessa mesma conversa.
 */
export async function responderEnquete(input: { identificador: string; ref: string; opcao: string }): Promise<RespostaDespesa | null> {
  const id = input.ref.startsWith("despesa:") ? input.ref.slice("despesa:".length) : null;
  if (!id) return null;
  const despesa = await prisma.despesa.findUnique({ where: { id }, select: { id: true, status: true, telefoneOrigem: true } });
  if (!despesa) return { mensagem: "Essa despesa já tinha sido descartada." };
  if (despesa.telefoneOrigem !== input.identificador) return null;
  if (despesa.status !== "A_CONFIRMAR") return { mensagem: "Essa despesa já estava confirmada — se precisar mudar algo, ajuste em Financeiro → Despesas." };

  if (input.opcao === OPCAO_CONFIRMAR) return confirmarRascunho(id, input.identificador);
  if (input.opcao === OPCAO_DESCARTAR) return descartarRascunho(id);
  if (input.opcao === OPCAO_NEGOCIO) {
    // Renova a janela do rascunho pra resposta com o nome do negócio cair nele.
    await prisma.despesa.update({ where: { id }, data: { atualizadoEm: new Date() } });
    return { mensagem: "Qual negócio? Me diga o nome do cliente ou da obra (texto ou áudio) que eu vinculo." };
  }
  return null;
}

/**
 * Correção em linguagem natural ("não, foi 260", "o centro é produção"):
 * vale pro rascunho esperando confirmação ou, sem rascunho, pra última
 * despesa registrada por essa conversa nos últimos 30 min e ainda não
 * conciliada. Rascunho continua pedindo confirmação depois de corrigido.
 */
export async function corrigirDespesaDaConversa(input: { identificador: string; correcao: ExtracaoDespesa; texto: string }): Promise<RespostaDespesa> {
  const alvo =
    (await buscarRascunhoAtivo(input.identificador)) ??
    (await prisma.despesa.findFirst({
      where: { telefoneOrigem: input.identificador, status: "AGUARDANDO_CONCILIACAO", criadoEm: { gte: new Date(Date.now() - JANELA_RASCUNHO_MS) } },
      orderBy: { criadoEm: "desc" },
    }));
  if (!alvo) return { mensagem: "Não achei nenhuma despesa recente sua pra corrigir — se for uma despesa nova, me conte de novo com valor e fornecedor." };

  const hoje = diaBrasilia(new Date());
  const { categorias, centrosGerais, negocios } = await carregarCadastrosDespesa();
  const c = input.correcao;
  const log = (alvo.extracao ?? {}) as Prisma.JsonObject;
  const decisao = (log.decisao ?? {}) as Prisma.JsonObject;
  let centroDeclarado = Boolean(log.centroDeclarado ?? decisao.centroDeclarado);
  const mudancas: Prisma.DespesaUncheckedUpdateInput = {};
  const naoEntendi: string[] = [];
  let duvidaNegocio = "";

  if (c.valor && c.valor > 0) mudancas.valorCentavos = Math.round(c.valor * 100);
  if (c.fornecedor?.trim()) mudancas.fornecedor = c.fornecedor.trim();
  if (c.descricao?.trim()) mudancas.descricao = c.descricao.trim();
  if (c.dataTexto?.trim() || c.data) {
    const dia = resolverDataFalada(c.dataTexto, hoje) ?? (c.data && c.data <= hoje ? c.data : null);
    if (dia) mudancas.data = dataDaDespesa(dia);
    else naoEntendi.push("a data");
  }
  if (c.centro?.trim()) {
    const centro = resolverCentro(c.centro, centrosGerais, negocios);
    if (centro) {
      mudancas.centroGeralId = centro.tipo === "GERAL" ? centro.id : null;
      mudancas.negocioId = centro.tipo === "NEGOCIO" ? centro.id : null;
      centroDeclarado = true;
    } else {
      // resolverCentro só falha havendo parecidos quando o nome empata entre
      // eles — "não encontrei" aí confunde (3º teste: "Manutenção FEMA",
      // dito duas vezes, respondido duas vezes com "não encontrei").
      const parecidos = negociosParecidos(c.centro, negocios);
      if (parecidos.length) {
        duvidaNegocio = `Achei mais de um negócio para "${c.centro}": ${parecidos.map((n) => `*${n.titulo}*`).join(", ")} — diga qual (pode ser só um pedaço do nome, ex.: a cidade).`;
      } else naoEntendi.push(`o negócio "${c.centro}"`);
    }
  }
  if (c.categoria?.trim()) {
    const categoria = resolverCategoria(c.categoria, categorias);
    if (categoria) {
      mudancas.categoriaId = categoria.id;
      // Bug do primeiro teste (2026-10-07): pedágio -> corrigido pra
      // Alimentação continuou com o centro Veículos, que tinha sido deduzido
      // do pedágio. Centro deduzido (e geral) acompanha a categoria nova.
      if (!c.centro?.trim() && !centroDeclarado && !alvo.negocioId && categoria.centroGeralPadraoId) {
        mudancas.centroGeralId = categoria.centroGeralPadraoId;
      }
    } else naoEntendi.push(`a categoria "${c.categoria}"`);
  }

  // Só o que muda de verdade conta — "lance na categoria Veículos" quando já
  // era Veículos não gera outro resumo nem outra enquete (2º teste do Marcos).
  const atual: Record<string, unknown> = alvo;
  for (const [campo, valor] of Object.entries(mudancas)) {
    const antes = atual[campo];
    const igual = valor instanceof Date && antes instanceof Date ? valor.getTime() === antes.getTime() : valor === antes;
    if (igual) delete (mudancas as Record<string, unknown>)[campo];
  }
  const mudou = Object.keys(mudancas).length > 0;

  const correcoes = Array.isArray(log.correcoes) ? log.correcoes : [];
  await prisma.despesa.update({
    where: { id: alvo.id },
    data: {
      ...mudancas,
      extracao: {
        ...log,
        centroDeclarado,
        correcoes: [...correcoes, { mensagem: input.texto, extraidoPeloModelo: c, mudou, em: new Date().toISOString() }],
      } as Prisma.InputJsonValue,
    },
  });
  console.log(`[despesa-agente] correção ${alvo.id}: ${JSON.stringify({ mensagem: input.texto, correcao: c, mudou: Object.keys(mudancas), naoEntendi })}`);

  const naoAchei = [naoEntendi.length ? `Não encontrei ${naoEntendi.join(" nem ")}. Diga de outro jeito.` : "", duvidaNegocio]
    .filter(Boolean)
    .join(" ");
  if (!mudou) {
    // Nada mudou: resposta curta, sem repetir o resumo nem mandar outra enquete.
    if (naoAchei) return { mensagem: naoAchei };
    return alvo.status === "A_CONFIRMAR" ? jaEstaAssim(input.identificador) : { mensagem: "Já está assim 👍" };
  }
  const aviso = naoAchei ? `${naoAchei}\n\n` : "";
  if (alvo.status === "A_CONFIRMAR") {
    const pedido = await pedirConfirmacao(alvo.id, input.identificador, "Corrigi, confere?");
    return { mensagem: aviso + pedido.mensagem, enquete: pedido.enquete };
  }
  return {
    mensagem: aviso + mensagemDeRegistro(await resumoParaMensagem(alvo.id), hoje, "✏️ Corrigido"),
    botoes: canalDoIdentificador(input.identificador) === "telegram" ? botoesDeRegistro(alvo.id) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Botões (Telegram, pedido de 2026-10-07). Cada toque chega aqui já lido
// (lib/utils/agente-canal.ts, lerBotao) e só vale pra despesa da mesma
// conversa. A mesma regra do texto: rascunho mostra o resumo de novo depois
// de mudar; despesa registrada mostra "Corrigido" com o Desfazer.
// ---------------------------------------------------------------------------

function jaConciliada(): RespostaDespesa {
  return { mensagem: "Essa despesa já foi conciliada com o extrato — pra mudar, desfaça a conciliação em Financeiro → Conciliação bancária." };
}

/** Renova a janela de 30 min do rascunho, pra resposta por texto/áudio cair nele. */
function renovarRascunho(id: string) {
  return prisma.despesa.update({ where: { id }, data: { atualizadoEm: new Date() } });
}

async function respostaDepoisDeMudar(id: string, identificador: string, intro: string): Promise<RespostaDespesa> {
  const { status } = await prisma.despesa.findUniqueOrThrow({ where: { id }, select: { status: true } });
  if (status === "A_CONFIRMAR") return pedirConfirmacao(id, identificador, intro);
  return {
    mensagem: mensagemDeRegistro(await resumoParaMensagem(id), diaBrasilia(new Date()), "✏️ Corrigido"),
    botoes: canalDoIdentificador(identificador) === "telegram" ? botoesDeRegistro(id) : undefined,
  };
}

/** Desfazer: a despesa registrada volta a ser rascunho (corrigir, confirmar de novo ou descartar). */
async function desfazerRegistro(d: { id: string; status: string }, identificador: string): Promise<RespostaDespesa> {
  if (d.status === "CONCILIADA") return jaConciliada();
  if (d.status === "A_CONFIRMAR") return pedirConfirmacao(d.id, identificador, "Ela ainda está esperando confirmação:");
  await prisma.despesa.update({ where: { id: d.id }, data: { status: "A_CONFIRMAR", confirmadaEm: null } });
  return pedirConfirmacao(d.id, identificador, "↩️ Desfeito — a despesa voltou a esperar confirmação. Corrija, confirme de novo ou descarte:");
}

/**
 * "É a mesma, juntar": a despesa nova (rascunho) entra na já registrada — o
 * arquivo (comprovante vale mais que áudio), o texto e o que a registrada não
 * tinha — e a nova some. Conciliada só recebe arquivo e texto.
 */
export async function juntarComRegistrada(novaId: string, existenteId: string, identificador: string): Promise<RespostaDespesa> {
  const [nova, existente] = await Promise.all([
    prisma.despesa.findUnique({ where: { id: novaId } }),
    prisma.despesa.findUnique({ where: { id: existenteId } }),
  ]);
  if (!nova || nova.telefoneOrigem !== identificador) return { mensagem: "Essa despesa não existe mais." };
  if (nova.status !== "A_CONFIRMAR") return { mensagem: "Essa despesa já foi registrada separada — se for repetida, ajuste em Financeiro → Despesas." };
  if (!existente || existente.id === nova.id) return { mensagem: "Não achei mais a despesa registrada pra juntar." };

  const mudancas: Prisma.DespesaUncheckedUpdateInput = {};
  const trocaArquivo = Boolean(nova.anexoMime) && (!existente.anexoMime || (nova.origem === "COMPROVANTE" && existente.origem !== "COMPROVANTE"));
  if (trocaArquivo) {
    mudancas.anexoBytes = nova.anexoBytes;
    mudancas.anexoMime = nova.anexoMime;
    mudancas.anexoNome = nova.anexoNome;
  }
  let fornecedor = existente.fornecedor;
  if (existente.status !== "CONCILIADA") {
    if (!existente.fornecedor.trim() && nova.fornecedor.trim()) mudancas.fornecedor = fornecedor = nova.fornecedor;
    if (!existente.categoriaId && nova.categoriaId) mudancas.categoriaId = nova.categoriaId;
    if (!existente.centroGeralId && !existente.negocioId && (nova.centroGeralId || nova.negocioId)) {
      mudancas.centroGeralId = nova.centroGeralId;
      mudancas.negocioId = nova.negocioId;
    }
  }
  const log = (existente.extracao ?? {}) as Prisma.JsonObject;
  const juntadas = Array.isArray(log.juntadas) ? log.juntadas : [];
  await prisma.$transaction([
    prisma.despesa.update({
      where: { id: existente.id },
      data: {
        ...mudancas,
        textoOriginal: [existente.textoOriginal, nova.textoOriginal].filter(Boolean).join("\n\n") || null,
        extracao: {
          ...log,
          juntadas: [...juntadas, { despesaId: nova.id, origem: nova.origem, fornecedor: nova.fornecedor, extracao: nova.extracao, em: new Date().toISOString() }],
        } as Prisma.InputJsonValue,
      },
    }),
    // O push do banco que tinha virado a despesa nova passa pra que fica.
    prisma.avisoBancario.updateMany({ where: { despesaId: nova.id }, data: { despesaId: existente.id } }),
    prisma.despesa.delete({ where: { id: nova.id } }),
  ]);
  const dia = diaBrasilia(existente.data).split("-").reverse().slice(0, 2).join("/");
  const guardado = trocaArquivo ? " O arquivo ficou guardado nela." : "";
  // Juntou num rascunho desta conversa (ex.: áudio no push que ainda espera
  // confirmação): mostra o resumo dele com os botões.
  if (existente.status === "A_CONFIRMAR" && existente.telefoneOrigem === identificador) {
    return pedirConfirmacao(existente.id, identificador, `🔗 Juntei as duas.${guardado} Confere:`);
  }
  return { mensagem: `🔗 Juntei na despesa já registrada: *${reais(existente.valorCentavos)}* — ${fornecedor} (${dia}).${guardado}` };
}

/** Um toque em botão de despesa (ver PedidoBotao). null = não é de despesa ou não é dessa conversa. */
export async function responderBotaoDespesa(pedido: PedidoBotao, identificador: string): Promise<RespostaDespesa | null> {
  if (pedido.tipo !== "despesa" && pedido.tipo !== "categoria" && pedido.tipo !== "centro" && pedido.tipo !== "juntar") return null;
  const d = await prisma.despesa.findUnique({ where: { id: pedido.despesaId } });
  if (!d) return { mensagem: "Essa despesa não existe mais (já tinha sido descartada)." };
  if (d.telefoneOrigem !== identificador) return null;
  const rascunho = d.status === "A_CONFIRMAR";
  const conciliada = d.status === "CONCILIADA";

  if (pedido.tipo === "juntar") return juntarComRegistrada(d.id, pedido.existenteId, identificador);

  if (pedido.tipo === "categoria") {
    if (conciliada) return jaConciliada();
    const { categorias } = await carregarCadastrosDespesa();
    const achadas = categorias.filter((c) => c.id.startsWith(pedido.prefixo));
    if (achadas.length !== 1) return { mensagem: "Não achei essa categoria — toque em trocar de novo." };
    const categoria = achadas[0];
    const log = (d.extracao ?? {}) as Prisma.JsonObject;
    const mudancas: Prisma.DespesaUncheckedUpdateInput = { categoriaId: categoria.id };
    // Mesma regra da correção por texto: centro deduzido acompanha a categoria.
    if (!declarados(d.extracao).centroDeclarado && !d.negocioId && categoria.centroGeralPadraoId) mudancas.centroGeralId = categoria.centroGeralPadraoId;
    await prisma.despesa.update({ where: { id: d.id }, data: { ...mudancas, extracao: { ...log, categoriaEscolhida: true } as Prisma.InputJsonValue } });
    return respostaDepoisDeMudar(d.id, identificador, "Categoria trocada, confere?");
  }

  if (pedido.tipo === "centro") {
    if (conciliada) return jaConciliada();
    const centro = await prisma.centroGeral.findFirst({ where: { id: pedido.centroGeralId, ativo: true } });
    if (!centro) return { mensagem: "Não achei esse centro — toque em trocar de novo." };
    const log = (d.extracao ?? {}) as Prisma.JsonObject;
    await prisma.despesa.update({
      where: { id: d.id },
      data: { centroGeralId: centro.id, negocioId: null, extracao: { ...log, centroDeclarado: true } as Prisma.InputJsonValue },
    });
    return respostaDepoisDeMudar(d.id, identificador, "Centro trocado, confere?");
  }

  switch (pedido.acao) {
    case "ok":
      return rascunho ? confirmarRascunho(d.id, identificador) : { mensagem: "Essa despesa já estava registrada 👍" };
    case "x":
      return rascunho
        ? descartarRascunho(d.id)
        : { mensagem: "Essa despesa já foi registrada — pra apagar, toque em *Desfazer* e depois em *Descartar*, ou ajuste em Financeiro → Despesas." };
    case "co":
      if (conciliada) return jaConciliada();
      if (rascunho) await renovarRascunho(d.id);
      return perguntarOQueCorrigir();
    case "ng":
      if (conciliada) return jaConciliada();
      if (rascunho) await renovarRascunho(d.id);
      return { mensagem: "Qual negócio? Me diga o nome do cliente ou da obra (texto ou áudio) que eu vinculo." };
    case "re":
      return rascunho ? pedirConfirmacao(d.id, identificador) : respostaDepoisDeMudar(d.id, identificador, "");
    case "vc": {
      if (conciliada) return jaConciliada();
      const { categorias } = await carregarCadastrosDespesa();
      return { mensagem: "Escolha a categoria:", botoes: botoesDeCategorias(d.id, categorias, d.categoriaId) };
    }
    case "vg": {
      if (conciliada) return jaConciliada();
      const { centrosGerais } = await carregarCadastrosDespesa();
      return { mensagem: "Escolha o centro de custo:", botoes: botoesDeCentros(d.id, centrosGerais, d.negocioId ? null : d.centroGeralId) };
    }
    case "u":
      return desfazerRegistro(d, identificador);
    case "ou": {
      if (!rascunho) return { mensagem: "Essa despesa já estava registrada 👍" };
      const log = (d.extracao ?? {}) as Prisma.JsonObject;
      await prisma.despesa.update({ where: { id: d.id }, data: { extracao: { ...log, naoEhParecida: true } as Prisma.InputJsonValue } });
      return pedirConfirmacao(d.id, identificador, "Certo, é outra despesa. Confere:");
    }
  }
}
