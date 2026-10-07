import "server-only";
import { prisma } from "@/lib/db";
import type { OrigemDespesa, Prisma } from "@prisma/client";
import { criarDespesa, confirmarDespesa } from "@/lib/server/despesas";
import { diaBrasilia } from "@/lib/utils/brasilia";
import { dataDaDespesa, pendenciasDaDespesa } from "@/lib/utils/despesas";
import {
  OPCAO_CONFIRMAR,
  OPCAO_DESCARTAR,
  OPCAO_NEGOCIO,
  canalDoIdentificador,
  enqueteDaDespesa,
  mensagemDeConfirmacao,
  mensagemDeRegistro,
  montarDespesaDaMensagem,
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
    negocios: negocios.map((n) => ({ id: n.id, titulo: n.titulo, contatoNome: n.contato?.nome ?? null })),
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

  const despesa = await criarDespesa({
    ...montada.dados,
    origem: input.origem,
    registradaPorId: input.usuarioId,
    rascunho: !montada.registrarDireto,
    anexo: input.anexo,
    textoOriginal: input.texto,
    extracao: log as unknown as Prisma.InputJsonValue,
    telefoneOrigem: input.identificador,
  });

  const canal = canalDoIdentificador(input.identificador);
  if (montada.registrarDireto) {
    return { mensagem: mensagemDeRegistro(montada, hoje), despesaId: despesa.id, registradaDireto: true };
  }
  return {
    mensagem: mensagemDeConfirmacao(montada, hoje, undefined, canal),
    enquete: canal === "whatsapp" ? enqueteDaDespesa({ ...despesa, ehProjeto: montada.nomes.centroEhProjeto }) : undefined,
    despesaId: despesa.id,
    registradaDireto: false,
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
    } else naoEntendi.push(`o negócio ou centro "${c.centro}"`);
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

  const correcoes = Array.isArray(log.correcoes) ? log.correcoes : [];
  await prisma.despesa.update({
    where: { id: alvo.id },
    data: {
      ...mudancas,
      extracao: {
        ...log,
        centroDeclarado,
        correcoes: [...correcoes, { mensagem: input.texto, extraidoPeloModelo: c, em: new Date().toISOString() }],
      } as Prisma.InputJsonValue,
    },
  });
  console.log(`[despesa-agente] correção ${alvo.id}: ${JSON.stringify({ mensagem: input.texto, correcao: c, naoEntendi })}`);

  const aviso = naoEntendi.length ? `Não encontrei ${naoEntendi.join(" nem ")} — diga de outro jeito.\n\n` : "";
  if (alvo.status === "A_CONFIRMAR") {
    const pedido = await pedirConfirmacao(alvo.id, input.identificador, "Corrigi, confere?");
    return { mensagem: aviso + pedido.mensagem, enquete: pedido.enquete };
  }
  return { mensagem: aviso + mensagemDeRegistro(await resumoParaMensagem(alvo.id), hoje, "✏️ Corrigido") };
}
