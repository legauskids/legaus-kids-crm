import "server-only";
import type { OrigemCotacaoFornecedor, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buscarClientesPorTelefone, buscarNegociosSimilarIds } from "@/lib/server/busca-similar";
import { diaBrasilia } from "@/lib/utils/brasilia";
import { dataDaDespesa } from "@/lib/utils/despesas";
import { PARTE_ARQUIVO_NEGOCIO, mimeSeguro, nomeArquivoSeguro, totalDePartes } from "@/lib/utils/negocio-arquivos";
import { semVendaComPosVenda } from "@/lib/utils/negocio-pos-venda";
import { telefonePadraoBR } from "@/lib/utils/telefone";
import {
  campoDeTexto,
  dataDaCotacao,
  idadeDaCotacao,
  itensDaExtracao,
  itensQueCombinam,
  mensagemCotacaoSalva,
  mesmoFornecedor,
  precoDoItem,
  tituloDaCotacao,
  validadeDaCotacao,
  type ExtracaoCotacao,
  type ItemCotacao,
  type ItemExtraido,
  type ResumoCotacao,
} from "@/lib/utils/cotacao-fornecedor";

// Cotações de fornecedores (pedido de 2026-11-24) — ver CotacaoFornecedor no
// schema e lib/utils/cotacao-fornecedor.ts. Pelo agente (WhatsApp, Telegram,
// chat do CRM) a cotação é salva direto, sem confirmar (decisão do Marcos), e
// se corrige ou apaga depois.

/** Fotos/prints/PDF da mesma cotação mandados em sequência: juntam na mesma, se for o mesmo fornecedor. */
const JANELA_JUNTAR_MS = 30 * 60 * 1000;
/** O agente só corrige ou apaga cotação salva na mesma conversa, até 1 dia depois (o resto, na tela). */
const JANELA_CONVERSA_MS = 24 * 60 * 60 * 1000;
const SEM_FORNECEDOR = "Fornecedor não identificado";

export type AnexoCotacao = { bytes: Buffer; mime: string; nome: string };

function soDigitos(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "");
}

/**
 * Fornecedor do cadastro: pelo CNPJ, pelo telefone ou pelo nome (entre os
 * Fornecedores). Não achou: cria um Contato FORNECEDOR com o que veio.
 */
async function vincularFornecedor(f: ExtracaoCotacao["fornecedor"]): Promise<{ id: string; nome: string; novo: boolean } | null> {
  const nome = campoDeTexto(f?.nome);
  if (!nome) return null;
  const cnpj = soDigitos(f?.cnpj);
  if (cnpj.length === 14) {
    const [porCnpj] = await prisma.$queryRaw<{ id: string; nome: string }[]>`
      SELECT id, nome FROM "Contato" WHERE regexp_replace(COALESCE(cnpj, ''), '\\D', '', 'g') = ${cnpj} LIMIT 1
    `;
    if (porCnpj) return { ...porCnpj, novo: false };
  }
  const telefone = soDigitos(f?.telefone).length >= 10 ? telefonePadraoBR(f!.telefone!) : null;
  if (telefone) {
    const [porTelefone] = await buscarClientesPorTelefone(telefone, 1);
    if (porTelefone) return { id: porTelefone.id, nome: porTelefone.nome, novo: false };
  }
  const fornecedores = await prisma.contato.findMany({ where: { tipo: "FORNECEDOR" }, select: { id: true, nome: true, empresa: true, razaoSocial: true } });
  const porNome = fornecedores.find((c) => [c.nome, c.empresa, c.razaoSocial].some((n) => n && mesmoFornecedor(n, nome)));
  if (porNome) return { id: porNome.id, nome: porNome.nome, novo: false };

  const criado = await prisma.contato.create({
    data: {
      nome,
      tipo: "FORNECEDOR",
      razaoSocial: cnpj.length === 14 ? nome : null,
      cnpj: cnpj.length === 14 ? cnpj : null,
      email: campoDeTexto(f?.email),
      cidade: campoDeTexto(f?.cidade),
      // telefone é único no cadastro: só se ninguém tiver (ver busca acima).
      telefone,
    },
    select: { id: true, nome: true },
  });
  return { ...criado, novo: true };
}

/** Negócio/obra pelo nome; só liga se achar um (o pós-venda ganha do de venda — mesmo projeto). */
async function negocioPeloNome(nome: string | null): Promise<{ id: string; titulo: string } | null> {
  if (!nome) return null;
  const ids = await buscarNegociosSimilarIds(nome, 8);
  if (!ids.length) return null;
  const negocios = await prisma.negocio.findMany({ where: { id: { in: ids }, excluidoEm: null }, select: { id: true, titulo: true, contato: { select: { nome: true } } } });
  const sobra = semVendaComPosVenda(negocios.map((n) => ({ id: n.id, titulo: n.titulo, contatoNome: n.contato?.nome ?? null })));
  return sobra.length === 1 ? { id: sobra[0].id, titulo: sobra[0].titulo } : null;
}

/**
 * Arquivos fora da transação da cotação: um PDF grande leva mais que os 5 s
 * de uma transação (visto no teste com 7 MB). O que falhar é apagado e vira
 * aviso — a cotação fica salva sem ele.
 */
async function guardarArquivos(cotacaoId: string, anexos: AnexoCotacao[]): Promise<string[]> {
  const avisos: string[] = [];
  for (const anexo of anexos) {
    const partesTotal = totalDePartes(anexo.bytes.length);
    const arquivo = await prisma.cotacaoFornecedorArquivo.create({
      data: { cotacaoId, nome: nomeArquivoSeguro(anexo.nome), mime: mimeSeguro(anexo.mime), tamanho: anexo.bytes.length, partesTotal },
      select: { id: true },
    });
    try {
      for (let indice = 0; indice < partesTotal; indice++) {
        const bytes = anexo.bytes.subarray(indice * PARTE_ARQUIVO_NEGOCIO, (indice + 1) * PARTE_ARQUIVO_NEGOCIO);
        await prisma.cotacaoFornecedorArquivoParte.create({ data: { arquivoId: arquivo.id, indice, bytes: new Uint8Array(bytes) } });
      }
    } catch (erro) {
      console.error(`[cotacao-fornecedor] não guardei o arquivo ${anexo.nome}: ${erro instanceof Error ? erro.message : erro}`);
      await prisma.cotacaoFornecedorArquivo.delete({ where: { id: arquivo.id } }).catch(() => {});
      avisos.push(`Não consegui guardar o arquivo ${anexo.nome} — mande de novo se quiser ele junto.`);
    }
  }
  return avisos;
}

const SELECT_RESUMO = {
  id: true,
  numero: true,
  titulo: true,
  fornecedorNome: true,
  data: true,
  validade: true,
  totalCentavos: true,
  frete: true,
  prazoEntrega: true,
  pagamento: true,
  impostos: true,
  observacoes: true,
  negocio: { select: { titulo: true } },
  itens: { orderBy: { ordem: "asc" }, select: { descricao: true, unidade: true, quantidade: true, precoUnitarioCentavos: true, totalCentavos: true, observacao: true } },
  _count: { select: { arquivos: true } },
} satisfies Prisma.CotacaoFornecedorSelect;

async function resumo(id: string, fornecedorNovo = false): Promise<ResumoCotacao & { id: string }> {
  const c = await prisma.cotacaoFornecedor.findUniqueOrThrow({ where: { id }, select: SELECT_RESUMO });
  return {
    id: c.id,
    numero: c.numero,
    titulo: c.titulo,
    fornecedorNome: c.fornecedorNome,
    fornecedorNovo,
    data: diaBrasilia(c.data),
    validade: c.validade ? diaBrasilia(c.validade) : null,
    itens: c.itens,
    totalCentavos: c.totalCentavos,
    frete: c.frete,
    prazoEntrega: c.prazoEntrega,
    pagamento: c.pagamento,
    impostos: c.impostos,
    observacoes: c.observacoes,
    negocio: c.negocio?.titulo ?? null,
    arquivos: c._count.arquivos,
  };
}

function chaveItem(i: Pick<ItemCotacao, "descricao" | "precoUnitarioCentavos">): string {
  return `${i.descricao.toLowerCase()}\u0000${i.precoUnitarioCentavos ?? ""}`;
}

export type ResultadoCotacao = { mensagem: string; cotacaoId: string | null };

/**
 * Salva a cotação que o modelo leu (foto, print, PDF, texto ou áudio). Foto
 * seguinte do mesmo fornecedor, na mesma conversa, em até 30 min, junta na
 * mesma cotação (cotação em vários prints).
 */
export async function registrarCotacaoDaMensagem(input: {
  extracao: ExtracaoCotacao;
  texto: string;
  origem: OrigemCotacaoFornecedor;
  identificador: string;
  usuarioId: string;
  anexos: AnexoCotacao[];
  agora?: Date;
}): Promise<ResultadoCotacao> {
  const agora = input.agora ?? new Date();
  const hoje = diaBrasilia(agora);
  const e = input.extracao;
  const itens = itensDaExtracao(e.itens);
  const nomeLido = campoDeTexto(e.fornecedor?.nome);
  if (!itens.length && !input.anexos.length) {
    return { mensagem: "Não entendi produtos nem preços nessa cotação. Mande a foto, o print ou o PDF, ou diga o fornecedor, o produto e o preço.", cotacaoId: null };
  }

  const anterior = await prisma.cotacaoFornecedor.findFirst({
    where: { telefoneOrigem: input.identificador, criadoEm: { gte: new Date(agora.getTime() - JANELA_JUNTAR_MS) } },
    orderBy: { criadoEm: "desc" },
    select: { id: true, fornecedorNome: true, validade: true, frete: true, prazoEntrega: true, pagamento: true, impostos: true, observacoes: true, totalCentavos: true, extracao: true, itens: { select: { descricao: true, precoUnitarioCentavos: true, ordem: true } } },
  });
  if (anterior && (!nomeLido || mesmoFornecedor(anterior.fornecedorNome, nomeLido))) {
    const jaTem = new Set(anterior.itens.map(chaveItem));
    const novos = itens.filter((i) => !jaTem.has(chaveItem(i)));
    const ordem = Math.max(-1, ...anterior.itens.map((i) => i.ordem)) + 1;
    const data = diaBrasilia(agora);
    const validade = anterior.validade ? null : validadeDaCotacao(e.validadeTexto, dataDaCotacao(e.dataTexto, hoje));
    const log = (anterior.extracao ?? {}) as Prisma.JsonObject;
    const juntadas = Array.isArray(log.juntadas) ? log.juntadas : [];
    await prisma.$transaction(async (tx) => {
      await tx.cotacaoFornecedorItem.createMany({ data: novos.map((i, n) => ({ ...i, cotacaoId: anterior.id, ordem: ordem + n })) });
      await tx.cotacaoFornecedor.update({
        where: { id: anterior.id },
        data: {
          // Só preenche o que ainda estava vazio.
          ...(validade ? { validade: dataDaDespesa(validade) } : {}),
          ...(anterior.frete ? {} : { frete: campoDeTexto(e.frete) }),
          ...(anterior.prazoEntrega ? {} : { prazoEntrega: campoDeTexto(e.prazoEntrega) }),
          ...(anterior.pagamento ? {} : { pagamento: campoDeTexto(e.pagamento) }),
          ...(anterior.impostos ? {} : { impostos: campoDeTexto(e.impostos) }),
          ...(anterior.observacoes ? {} : { observacoes: campoDeTexto(e.observacoes) }),
          ...(anterior.totalCentavos === null && typeof e.total === "number" ? { totalCentavos: Math.round(e.total * 100) } : {}),
          extracao: { ...log, juntadas: [...juntadas, { extracao: e, texto: input.texto, em: agora.toISOString(), dia: data }] } as Prisma.InputJsonValue,
        },
      });
    });
    const avisosArquivo = await guardarArquivos(anterior.id, input.anexos);
    console.log(`[cotacao-fornecedor] juntei ${novos.length} item(ns) e ${input.anexos.length} arquivo(s) na ${anterior.id}`);
    return { mensagem: mensagemCotacaoSalva(await resumo(anterior.id), { juntou: true, avisos: avisosArquivo }), cotacaoId: anterior.id };
  }

  const avisos: string[] = [];
  const fornecedor = await vincularFornecedor(e.fornecedor);
  if (!fornecedor) avisos.push("Não achei o nome do fornecedor — me diga qual é que eu corrijo.");
  const nomeNegocio = campoDeTexto(e.negocio);
  const negocio = await negocioPeloNome(nomeNegocio);
  if (nomeNegocio && !negocio) avisos.push(`Não achei um negócio só para "${nomeNegocio}" — ficou sem obra. Me diga o nome certo se quiser ligar.`);
  const fornecedorNome = nomeLido ?? SEM_FORNECEDOR;
  const data = dataDaCotacao(e.dataTexto, hoje);
  const validade = validadeDaCotacao(e.validadeTexto, data);

  const cotacao = await prisma.cotacaoFornecedor.create({
    data: {
      titulo: tituloDaCotacao(fornecedorNome, e.resumo, itens, data),
      fornecedorNome,
      fornecedorId: fornecedor?.id ?? null,
      data: dataDaDespesa(data),
      validade: validade ? dataDaDespesa(validade) : null,
      frete: campoDeTexto(e.frete),
      prazoEntrega: campoDeTexto(e.prazoEntrega),
      pagamento: campoDeTexto(e.pagamento),
      impostos: campoDeTexto(e.impostos),
      observacoes: campoDeTexto(e.observacoes),
      totalCentavos: typeof e.total === "number" && e.total >= 0 ? Math.round(e.total * 100) : null,
      negocioId: negocio?.id ?? null,
      origem: input.origem,
      textoOriginal: input.texto || null,
      extracao: e as Prisma.InputJsonValue,
      telefoneOrigem: input.identificador,
      registradaPorId: input.usuarioId,
      itens: { create: itens.map((i, ordem) => ({ ...i, ordem })) },
    },
    select: { id: true },
  });
  avisos.push(...(await guardarArquivos(cotacao.id, input.anexos)));
  console.log(`[cotacao-fornecedor] ${cotacao.id}: ${fornecedorNome}, ${itens.length} item(ns), ${input.anexos.length} arquivo(s)`);
  return { mensagem: mensagemCotacaoSalva(await resumo(cotacao.id, fornecedor?.novo), { avisos }), cotacaoId: cotacao.id };
}

/** Soma dos totais dos itens, ou null se algum não tiver total. */
function somaDosItens(itens: { totalCentavos: number | null }[]): number | null {
  if (!itens.length || itens.some((i) => i.totalCentavos === null)) return null;
  return itens.reduce((soma, i) => soma + (i.totalCentavos ?? 0), 0);
}

/** A cotação que o agente pode mexer: a nº informada ou a última, salva nesta conversa no último dia. */
async function cotacaoDaConversa(identificador: string, numero?: number | null) {
  return prisma.cotacaoFornecedor.findFirst({
    where: {
      telefoneOrigem: identificador,
      criadoEm: { gte: new Date(Date.now() - JANELA_CONVERSA_MS) },
      ...(numero ? { numero } : {}),
    },
    orderBy: { criadoEm: "desc" },
    select: {
      id: true,
      numero: true,
      fornecedorNome: true,
      data: true,
      extracao: true,
      totalCentavos: true,
      itens: { orderBy: { ordem: "asc" }, select: { id: true, ordem: true, quantidade: true, precoUnitarioCentavos: true, totalCentavos: true } },
    },
  });
}

export type CorrecaoCotacao = Omit<ExtracaoCotacao, "itens"> & {
  numero?: number | null;
  /** Itens como aparecem no resumo (1, 2, 3…): o que mudar em cada um. */
  alterarItens?: ({ item: number; remover?: boolean | null } & ItemExtraido)[] | null;
  novosItens?: ItemExtraido[] | null;
};

/** "O piso é 89,90", "a validade é 15 dias", "o fornecedor é a Borrachas Sul", "é da obra X". */
export async function corrigirCotacaoDaConversa(input: { identificador: string; correcao: CorrecaoCotacao; texto: string }): Promise<ResultadoCotacao> {
  const c = input.correcao;
  const alvo = await cotacaoDaConversa(input.identificador, c.numero);
  if (!alvo) {
    return {
      mensagem: c.numero
        ? `Não achei a cotação de fornecedor nº ${c.numero} entre as salvas aqui na conversa no último dia — corrija em Cadastros → Cotações de fornecedores.`
        : "Não achei cotação de fornecedor salva aqui na conversa no último dia — corrija em Cadastros → Cotações de fornecedores.",
      cotacaoId: null,
    };
  }
  const dados: Prisma.CotacaoFornecedorUpdateInput = {};
  const avisos: string[] = [];
  const nome = campoDeTexto(c.fornecedor?.nome);
  let fornecedorNovo = false;
  if (nome) {
    const fornecedor = await vincularFornecedor(c.fornecedor);
    dados.fornecedorNome = nome;
    dados.fornecedor = fornecedor ? { connect: { id: fornecedor.id } } : { disconnect: true };
    fornecedorNovo = fornecedor?.novo ?? false;
  }
  const dataAtual = diaBrasilia(alvo.data);
  const data = c.dataTexto ? dataDaCotacao(c.dataTexto, diaBrasilia(new Date())) : dataAtual;
  if (c.dataTexto) dados.data = dataDaDespesa(data);
  if (c.validadeTexto) {
    const validade = validadeDaCotacao(c.validadeTexto, data);
    if (validade) dados.validade = dataDaDespesa(validade);
    else avisos.push(`Não entendi a validade "${c.validadeTexto}".`);
  }
  for (const campo of ["frete", "prazoEntrega", "pagamento", "impostos", "observacoes"] as const) {
    const valor = campoDeTexto(c[campo]);
    if (valor) dados[campo] = valor;
  }
  if (typeof c.total === "number" && c.total >= 0) dados.totalCentavos = Math.round(c.total * 100);
  if (campoDeTexto(c.negocio)) {
    const negocio = await negocioPeloNome(campoDeTexto(c.negocio));
    if (negocio) dados.negocio = { connect: { id: negocio.id } };
    else avisos.push(`Não achei um negócio só para "${c.negocio}".`);
  }

  await prisma.$transaction(async (tx) => {
    for (const mudanca of c.alterarItens ?? []) {
      const item = alvo.itens[mudanca.item - 1];
      if (!item) {
        avisos.push(`Não existe o item ${mudanca.item}.`);
        continue;
      }
      if (mudanca.remover) {
        await tx.cotacaoFornecedorItem.delete({ where: { id: item.id } });
        continue;
      }
      const [novo] = itensDaExtracao([{ descricao: mudanca.descricao ?? "x", ...mudanca }]);
      // Preço ou quantidade corrigidos: o total do item acompanha (o do documento deixou de valer).
      const quantidade = novo.quantidade ?? item.quantidade;
      const preco = novo.precoUnitarioCentavos ?? item.precoUnitarioCentavos;
      const recalculado = (novo.precoUnitarioCentavos !== null || novo.quantidade !== null) && quantidade !== null && preco !== null ? Math.round(quantidade * preco) : null;
      const total = novo.totalCentavos ?? recalculado;
      await tx.cotacaoFornecedorItem.update({
        where: { id: item.id },
        data: {
          ...(campoDeTexto(mudanca.descricao) ? { descricao: novo.descricao } : {}),
          ...(campoDeTexto(mudanca.unidade) ? { unidade: novo.unidade } : {}),
          ...(novo.quantidade !== null ? { quantidade: novo.quantidade } : {}),
          ...(novo.precoUnitarioCentavos !== null ? { precoUnitarioCentavos: novo.precoUnitarioCentavos } : {}),
          ...(total !== null ? { totalCentavos: total } : {}),
          ...(campoDeTexto(mudanca.observacao) ? { observacao: novo.observacao } : {}),
        },
      });
    }
    const novos = itensDaExtracao(c.novosItens);
    const ordem = Math.max(-1, ...alvo.itens.map((i) => i.ordem)) + 1;
    if (novos.length) await tx.cotacaoFornecedorItem.createMany({ data: novos.map((i, n) => ({ ...i, cotacaoId: alvo.id, ordem: ordem + n })) });
    // O total da cotação era a soma dos itens: continua sendo.
    if (typeof c.total !== "number" && alvo.totalCentavos !== null && alvo.totalCentavos === somaDosItens(alvo.itens)) {
      const soma = somaDosItens(await tx.cotacaoFornecedorItem.findMany({ where: { cotacaoId: alvo.id }, select: { totalCentavos: true } }));
      if (soma !== null) dados.totalCentavos = soma;
    }
    const log = (alvo.extracao ?? {}) as Prisma.JsonObject;
    const correcoes = Array.isArray(log.correcoes) ? log.correcoes : [];
    dados.extracao = { ...log, correcoes: [...correcoes, { mensagem: input.texto, correcao: c, em: new Date().toISOString() }] } as Prisma.InputJsonValue;
    await tx.cotacaoFornecedor.update({ where: { id: alvo.id }, data: dados });
    // O nome fácil acompanha fornecedor, data e itens.
    const atual = await tx.cotacaoFornecedor.findUniqueOrThrow({ where: { id: alvo.id }, select: { fornecedorNome: true, data: true, extracao: true, itens: { orderBy: { ordem: "asc" }, select: { descricao: true } } } });
    const resumoLido = ((atual.extracao ?? {}) as Prisma.JsonObject).resumo;
    await tx.cotacaoFornecedor.update({
      where: { id: alvo.id },
      data: { titulo: tituloDaCotacao(atual.fornecedorNome, campoDeTexto(c.resumo) ?? (typeof resumoLido === "string" ? resumoLido : null), atual.itens, diaBrasilia(atual.data)) },
    });
  });
  const r = await resumo(alvo.id, fornecedorNovo);
  return { mensagem: mensagemCotacaoSalva(r, { avisos }).replace(/^✅ Cotação de fornecedor salva — nº (\d+)/, "✏️ Corrigi a cotação de fornecedor nº $1:"), cotacaoId: alvo.id };
}

/** Apaga a cotação (com itens e arquivos) — pelo agente, só a salva nesta conversa no último dia. */
export async function apagarCotacaoDaConversa(identificador: string, numero?: number | null): Promise<ResultadoCotacao> {
  const alvo = await cotacaoDaConversa(identificador, numero);
  if (!alvo) {
    return { mensagem: "Não achei cotação de fornecedor salva aqui na conversa no último dia — apague em Cadastros → Cotações de fornecedores.", cotacaoId: null };
  }
  await prisma.cotacaoFornecedor.delete({ where: { id: alvo.id } });
  return { mensagem: `🗑️ Apaguei a cotação de fornecedor nº ${alvo.numero} (${alvo.fornecedorNome}).`, cotacaoId: alvo.id };
}

/** Botão "Apagar esta cotação" (Telegram): só a da própria conversa. */
export async function apagarCotacaoPeloBotao(cotacaoId: string, identificador: string): Promise<ResultadoCotacao | null> {
  const c = await prisma.cotacaoFornecedor.findUnique({ where: { id: cotacaoId }, select: { numero: true, telefoneOrigem: true } });
  if (!c) return { mensagem: "Essa cotação já tinha sido apagada.", cotacaoId: null };
  if (c.telefoneOrigem !== identificador) return null;
  return apagarCotacaoDaConversa(identificador, c.numero);
}

export function excluirCotacaoFornecedor(id: string) {
  return prisma.cotacaoFornecedor.delete({ where: { id } });
}

export type ItemEncontrado = {
  cotacaoId: string;
  numero: number;
  titulo: string;
  fornecedor: string;
  data: string;
  validade: string | null;
  vencida: boolean;
  descricao: string;
  unidade: string | null;
  quantidade: number | null;
  precoUnitarioCentavos: number | null;
  totalCentavos: number | null;
  observacao: string | null;
  frete: string | null;
  prazoEntrega: string | null;
  pagamento: string | null;
  impostos: string | null;
  negocio: string | null;
  arquivoIds: string[];
  pontos: number;
};

/**
 * "Piso emborrachado 15mm": os itens de todas as cotações que combinam com
 * algum dos termos (o agente manda variações), do mais parecido pro menos e,
 * empatado, do menor preço. Filtros: fornecedor (parte do nome) e desde.
 */
export async function buscarItensCotados(input: { termos: string[]; fornecedor?: string | null; desde?: string | null; limite?: number }): Promise<ItemEncontrado[]> {
  const fornecedor = campoDeTexto(input.fornecedor);
  const itens = await prisma.cotacaoFornecedorItem.findMany({
    where: { cotacao: { ...(input.desde && /^\d{4}-\d{2}-\d{2}$/.test(input.desde) ? { data: { gte: new Date(`${input.desde}T00:00:00-03:00`) } } : {}) } },
    select: {
      descricao: true,
      unidade: true,
      quantidade: true,
      precoUnitarioCentavos: true,
      totalCentavos: true,
      observacao: true,
      cotacao: {
        select: {
          id: true,
          numero: true,
          titulo: true,
          fornecedorNome: true,
          data: true,
          validade: true,
          frete: true,
          prazoEntrega: true,
          pagamento: true,
          impostos: true,
          negocio: { select: { titulo: true } },
          arquivos: { select: { id: true }, orderBy: { criadoEm: "asc" } },
        },
      },
    },
    take: 20000,
  });
  const doFornecedor = fornecedor ? itens.filter((i) => mesmoFornecedor(i.cotacao.fornecedorNome, fornecedor) || i.cotacao.fornecedorNome.toLowerCase().includes(fornecedor.toLowerCase())) : itens;
  const hoje = diaBrasilia(new Date());
  const achados = input.termos.some((t) => t.trim()) ? itensQueCombinam(input.termos, doFornecedor) : doFornecedor.map((item) => ({ item, pontos: 1 }));
  return achados
    .map(({ item: i, pontos }) => {
      const validade = i.cotacao.validade ? diaBrasilia(i.cotacao.validade) : null;
      return {
        cotacaoId: i.cotacao.id,
        numero: i.cotacao.numero,
        titulo: i.cotacao.titulo,
        fornecedor: i.cotacao.fornecedorNome,
        data: diaBrasilia(i.cotacao.data),
        validade,
        vencida: validade !== null && validade < hoje,
        descricao: i.descricao,
        unidade: i.unidade,
        quantidade: i.quantidade,
        precoUnitarioCentavos: i.precoUnitarioCentavos,
        totalCentavos: i.totalCentavos,
        observacao: i.observacao,
        frete: i.cotacao.frete,
        prazoEntrega: i.cotacao.prazoEntrega,
        pagamento: i.cotacao.pagamento,
        impostos: i.cotacao.impostos,
        negocio: i.cotacao.negocio?.titulo ?? null,
        arquivoIds: i.cotacao.arquivos.map((a) => a.id),
        pontos,
      };
    })
    .sort(
      (a, b) =>
        b.pontos - a.pontos ||
        (a.precoUnitarioCentavos ?? Number.MAX_SAFE_INTEGER) - (b.precoUnitarioCentavos ?? Number.MAX_SAFE_INTEGER) ||
        b.data.localeCompare(a.data),
    )
    .slice(0, input.limite ?? 25);
}

/** Pro agente: o item achado em palavras, com a idade da cotação (preço velho fica visível). */
export function itemParaAgente(i: ItemEncontrado, linkArquivo: (id: string) => string) {
  const hoje = diaBrasilia(new Date());
  return {
    cotacao: `nº ${i.numero} — ${i.titulo}`,
    fornecedor: i.fornecedor,
    produto: i.descricao,
    preco: precoDoItem(i),
    data: `${i.data.split("-").reverse().join("/")} (${idadeDaCotacao(i.data, hoje)})`,
    validade: i.validade ? `${i.validade.split("-").reverse().join("/")}${i.vencida ? " — VENCIDA" : ""}` : undefined,
    frete: i.frete ?? undefined,
    prazoEntrega: i.prazoEntrega ?? undefined,
    pagamento: i.pagamento ?? undefined,
    impostos: i.impostos ?? undefined,
    observacao: i.observacao ?? undefined,
    obra: i.negocio ?? undefined,
    arquivo: i.arquivoIds[0] ? linkArquivo(i.arquivoIds[0]) : undefined,
  };
}

export type CotacaoFornecedorVM = {
  id: string;
  numero: number;
  titulo: string;
  fornecedorNome: string;
  fornecedorId: string | null;
  data: string;
  validade: string | null;
  frete: string | null;
  prazoEntrega: string | null;
  pagamento: string | null;
  impostos: string | null;
  observacoes: string | null;
  totalCentavos: number | null;
  negocio: { id: string; titulo: string } | null;
  origem: OrigemCotacaoFornecedor;
  registradaPorNome: string;
  itens: (ItemCotacao & { id: string })[];
  arquivos: { id: string; nome: string; mime: string; tamanho: number }[];
};

/** Aba Cotações de fornecedores (Cadastros): as mais recentes primeiro, com itens e arquivos (sem os bytes). */
export async function listarCotacoesFornecedores(limite = 500): Promise<CotacaoFornecedorVM[]> {
  const cotacoes = await prisma.cotacaoFornecedor.findMany({
    orderBy: [{ data: "desc" }, { criadoEm: "desc" }],
    take: limite,
    select: {
      id: true,
      numero: true,
      titulo: true,
      fornecedorNome: true,
      fornecedorId: true,
      data: true,
      validade: true,
      frete: true,
      prazoEntrega: true,
      pagamento: true,
      impostos: true,
      observacoes: true,
      totalCentavos: true,
      origem: true,
      negocio: { select: { id: true, titulo: true } },
      registradaPor: { select: { nome: true } },
      itens: { orderBy: { ordem: "asc" }, select: { id: true, descricao: true, unidade: true, quantidade: true, precoUnitarioCentavos: true, totalCentavos: true, observacao: true } },
      arquivos: { orderBy: { criadoEm: "asc" }, select: { id: true, nome: true, mime: true, tamanho: true } },
    },
  });
  return cotacoes.map(({ data, validade, registradaPor, ...c }) => ({
    ...c,
    data: diaBrasilia(data),
    validade: validade ? diaBrasilia(validade) : null,
    registradaPorNome: registradaPor.nome,
  }));
}

export function getArquivoCotacao(id: string) {
  return prisma.cotacaoFornecedorArquivo.findUnique({ where: { id }, select: { nome: true, mime: true, tamanho: true, partesTotal: true } });
}

export async function lerParteArquivoCotacao(arquivoId: string, indice: number) {
  const parte = await prisma.cotacaoFornecedorArquivoParte.findUnique({ where: { arquivoId_indice: { arquivoId, indice } }, select: { bytes: true } });
  return parte?.bytes ?? null;
}
