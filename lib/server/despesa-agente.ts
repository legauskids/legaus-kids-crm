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
  type ExtracaoDespesa,
} from "@/lib/utils/despesa-agente";

// Agente financeiro do WhatsApp (pedido de 2026-10-07): a parte que mexe no
// banco. As regras (o que é "dito", data falada, registrar direto ou pedir
// confirmação) ficam em lib/utils/despesa-agente.ts, com testes.

/** Rascunho esperando confirmação vale por 30 minutos; depois disso só pela tela. */
const JANELA_RASCUNHO_MS = 30 * 60 * 1000;

/** Texto pro usuário + a enquete que vai logo abaixo dele no WhatsApp (só quando há rascunho esperando). */
export type RespostaDespesa = { mensagem: string; enquete?: Enquete };

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
  const parecida = await buscarDespesaParecida(montada.dados);
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
    return { mensagem: mensagemDeRegistro(montada, hoje), despesaId: despesa.id, registradaDireto: true };
  }
  const aviso = parecida
    ? `⚠️ Parece a mesma despesa já registrada: *${reais(parecida.valorCentavos)}* — ${parecida.fornecedor} (${diaBrasilia(parecida.data).split("-").reverse().slice(0, 2).join("/")}). Se for, ${canal === "whatsapp" ? "toque em *Descartar*" : "responda *descartar*"}.\n\n`
    : "";
  return {
    mensagem: aviso + mensagemDeConfirmacao(montada, hoje, undefined, canal),
    enquete: canal === "whatsapp" ? enqueteDaDespesa({ ...despesa, ehProjeto: montada.nomes.centroEhProjeto }) : undefined,
    despesaId: despesa.id,
    registradaDireto: false,
  };
}

function reais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");
}

/** Despesa já registrada (não rascunho) que parece ser o mesmo gasto — ver pareceMesmaDespesa. */
async function buscarDespesaParecida(d: { valorCentavos: number; dia: string; fornecedor: string }) {
  if (d.valorCentavos <= 0) return null;
  const candidatas = await prisma.despesa.findMany({
    where: {
      valorCentavos: d.valorCentavos,
      status: { in: ["AGUARDANDO_CONCILIACAO", "CONCILIADA"] },
      data: { gte: dataDaDespesa(somarDias(d.dia, -3)), lte: dataDaDespesa(somarDias(d.dia, 3)) },
    },
    select: { id: true, valorCentavos: true, fornecedor: true, data: true },
    orderBy: { criadoEm: "desc" },
  });
  return candidatas.find((c) => pareceMesmaDespesa(d, { ...c, dia: diaBrasilia(c.data) })) ?? null;
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
  return {
    mensagem:
      canalDoIdentificador(identificador) === "whatsapp"
        ? "Já está assim 👍 Confirme na enquete acima ou responda *sim*."
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

/** Resumo de um rascunho + a enquete (no WhatsApp). */
async function pedirConfirmacao(id: string, identificador: string, intro?: string): Promise<RespostaDespesa> {
  const r = await resumoParaMensagem(id);
  const canal = canalDoIdentificador(identificador);
  return {
    mensagem: mensagemDeConfirmacao(r, diaBrasilia(new Date()), intro, canal),
    enquete: canal === "whatsapp" ? enqueteDaDespesa({ ...r.despesa, ehProjeto: r.nomes.centroEhProjeto }) : undefined,
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
    return { mensagem: `Ainda falta: ${resumo.faltando.join(", ")}. Me diga pra eu completar (ex.: "o centro é Produção").` };
  }
  await confirmarDespesa(id);
  const registrado = mensagemDeRegistro(resumo, hoje);
  const proximo = await buscarRascunhoAtivo(identificador);
  if (!proximo) return { mensagem: registrado };
  const pedido = await pedirConfirmacao(proximo.id, identificador, "Tem mais uma esperando:");
  return { mensagem: `${registrado}\n\n${pedido.mensagem}`, enquete: pedido.enquete };
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
  return { mensagem: aviso + mensagemDeRegistro(await resumoParaMensagem(alvo.id), hoje, "✏️ Corrigido") };
}
