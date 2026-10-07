import "server-only";
import { prisma } from "@/lib/db";
import type { OrigemDespesa, Prisma } from "@prisma/client";
import { criarDespesa, confirmarDespesa } from "@/lib/server/despesas";
import { diaBrasilia } from "@/lib/utils/brasilia";
import { dataDaDespesa, pendenciasDaDespesa } from "@/lib/utils/despesas";
import {
  mensagemDeConfirmacao,
  mensagemDeRegistro,
  montarDespesaDaMensagem,
  resolverCategoria,
  resolverCentro,
  resolverDataFalada,
  type ExtracaoDespesa,
} from "@/lib/utils/despesa-agente";

// Agente financeiro do WhatsApp (pedido de 2026-10-07): a parte que mexe no
// banco. As regras (o que é "dito", data falada, registrar direto ou pedir
// confirmação) ficam em lib/utils/despesa-agente.ts, com testes.

/** Rascunho esperando "1" vale por 30 minutos; depois disso só pela tela. */
const JANELA_RASCUNHO_MS = 30 * 60 * 1000;

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
 * quando a regra deixa, senão como rascunho pedindo "1" ou a correção.
 * Devolve o texto pronto pra responder.
 */
export async function registrarDespesaDaMensagem(input: {
  extracao: ExtracaoDespesa;
  texto: string;
  origem: OrigemDespesa;
  identificador: string;
  usuarioId: string;
  anexo?: AnexoDespesa;
}): Promise<{ mensagem: string; despesaId: string; registradaDireto: boolean }> {
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

  return {
    mensagem: montada.registrarDireto ? mensagemDeRegistro(montada, hoje) : mensagemDeConfirmacao(montada, hoje),
    despesaId: despesa.id,
    registradaDireto: montada.registrarDireto,
  };
}

/** Rascunho mais recente desse WhatsApp (ou chat do CRM) ainda esperando o "1". */
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
    dados: { ...d, dia: diaBrasilia(d.data) },
    nomes: { categoria: d.categoria?.nome ?? null, centro: d.negocio?.titulo ?? d.centroGeral?.nome ?? null, centroEhProjeto: Boolean(d.negocioId) },
    faltando: pendenciasDaDespesa(d),
  };
}

/** Texto curto do rascunho pro contexto do modelo (pra entender a correção). */
export async function descreverRascunho(id: string): Promise<string> {
  const r = await resumoParaMensagem(id);
  return mensagemDeConfirmacao(r, diaBrasilia(new Date()), "Despesa esperando confirmação de quem está falando:").split("\n\n")[0];
}

/** O "1": confirma o rascunho e já mostra o próximo, se houver outro esperando. */
export async function confirmarRascunho(id: string, identificador: string): Promise<string> {
  const hoje = diaBrasilia(new Date());
  const resumo = await resumoParaMensagem(id);
  if (resumo.faltando.length) {
    return `Ainda falta: ${resumo.faltando.join(", ")}. Me diga pra eu completar (ex.: "o centro é Produção").`;
  }
  await confirmarDespesa(id);
  let resposta = mensagemDeRegistro(resumo, hoje);
  const proximo = await buscarRascunhoAtivo(identificador);
  if (proximo) resposta += `\n\n${mensagemDeConfirmacao(await resumoParaMensagem(proximo.id), hoje, "Tem mais uma esperando:")}`;
  return resposta;
}

export async function descartarRascunho(id: string): Promise<string> {
  await prisma.despesa.delete({ where: { id } });
  return "Descartei essa despesa, não registrei nada.";
}

/**
 * Correção em linguagem natural ("não, foi 260", "o centro é produção"):
 * vale pro rascunho esperando confirmação ou, sem rascunho, pra última
 * despesa registrada por essa conversa nos últimos 30 min e ainda não
 * conciliada. Rascunho continua pedindo "1" depois de corrigido.
 */
export async function corrigirDespesaDaConversa(input: { identificador: string; correcao: ExtracaoDespesa; texto: string }): Promise<string> {
  const alvo =
    (await buscarRascunhoAtivo(input.identificador)) ??
    (await prisma.despesa.findFirst({
      where: { telefoneOrigem: input.identificador, status: "AGUARDANDO_CONCILIACAO", criadoEm: { gte: new Date(Date.now() - JANELA_RASCUNHO_MS) } },
      orderBy: { criadoEm: "desc" },
    }));
  if (!alvo) return "Não achei nenhuma despesa recente sua pra corrigir — se for uma despesa nova, me conte de novo com valor e fornecedor.";

  const hoje = diaBrasilia(new Date());
  const { categorias, centrosGerais, negocios } = await carregarCadastrosDespesa();
  const c = input.correcao;
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
  if (c.categoria?.trim()) {
    const categoria = resolverCategoria(c.categoria, categorias);
    if (categoria) mudancas.categoriaId = categoria.id;
    else naoEntendi.push(`a categoria "${c.categoria}"`);
  }
  if (c.centro?.trim()) {
    const centro = resolverCentro(c.centro, centrosGerais, negocios);
    if (centro) {
      mudancas.centroGeralId = centro.tipo === "GERAL" ? centro.id : null;
      mudancas.negocioId = centro.tipo === "NEGOCIO" ? centro.id : null;
    } else naoEntendi.push(`o centro "${c.centro}"`);
  }

  const log = (alvo.extracao ?? {}) as Prisma.JsonObject;
  const correcoes = Array.isArray(log.correcoes) ? log.correcoes : [];
  await prisma.despesa.update({
    where: { id: alvo.id },
    data: { ...mudancas, extracao: { ...log, correcoes: [...correcoes, { mensagem: input.texto, extraidoPeloModelo: c, em: new Date().toISOString() }] } as Prisma.InputJsonValue },
  });
  console.log(`[despesa-agente] correção ${alvo.id}: ${JSON.stringify({ mensagem: input.texto, correcao: c, naoEntendi })}`);

  const resumo = await resumoParaMensagem(alvo.id);
  const aviso = naoEntendi.length ? `Não encontrei ${naoEntendi.join(" nem ")} — diga de outro jeito.\n\n` : "";
  if (alvo.status === "A_CONFIRMAR") return aviso + mensagemDeConfirmacao(resumo, hoje, "Corrigi, confere?");
  return aviso + mensagemDeRegistro(resumo, hoje, "✏️ Corrigido");
}
