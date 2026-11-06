import "server-only";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { carregarFotoProduto } from "@/lib/server/produto-cards";
import {
  MAX_IMAGENS_ORCAMENTO,
  apresentacaoPadrao,
  imagensUsadas,
  nomeArquivoApresentacao,
  normalizarPaginas,
  paginasDoCliente,
  resolverPagina,
  semImagem,
  type ImagemApresentacaoVM,
  type OrcamentoParaApresentacao,
  type PaginaApresentacao,
} from "@/lib/utils/apresentacao";

// Apresentação do orçamento (lib/utils/apresentacao.ts): o que fica guardado
// é só a lista de páginas (JSON) e as imagens extras. O PDF é gerado na hora
// (lib/server/pdf/apresentacao-pdf.tsx), sempre com os valores atuais do orçamento.

const formatarData = (data: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(data);

async function buscarOrcamento(orcamentoId: string) {
  return prisma.orcamento.findUnique({
    where: { id: orcamentoId },
    include: {
      contato: { select: { nome: true, telefone: true } },
      itens: { orderBy: { ordem: "asc" }, include: { produto: { select: { imagemUrl: true } } } },
      apresentacao: { select: { paginas: true } },
    },
  });
}

function paraApresentacao(orcamento: NonNullable<Awaited<ReturnType<typeof buscarOrcamento>>>): OrcamentoParaApresentacao {
  const validade = new Date(orcamento.createdAt);
  validade.setDate(validade.getDate() + orcamento.validadeDias);
  return {
    numero: orcamento.numero,
    cliente: orcamento.contato?.nome ?? null,
    validoAte: formatarData(validade),
    descontoCentavos: orcamento.descontoCentavos,
    observacoes: orcamento.observacoes,
    itens: orcamento.itens.map((i) => ({
      nome: i.nome,
      descricao: i.descricao,
      quantidade: i.quantidade,
      valorUnitarioCentavos: i.valorUnitarioCentavos,
      fotoUrl: i.produto?.imagemUrl ?? null,
    })),
  };
}



/** Tudo que a tela de edição precisa. */
export async function carregarApresentacao(orcamentoId: string) {
  const [orcamento, imagens] = await Promise.all([
    buscarOrcamento(orcamentoId),
    prisma.apresentacaoImagem.findMany({
      where: { orcamentoId },
      select: { id: true, nome: true, largura: true, altura: true },
      orderBy: { criadoEm: "asc" },
    }),
  ]);
  if (!orcamento) return null;
  const vm = paraApresentacao(orcamento);
  const guardadas = normalizarPaginas(orcamento.apresentacao?.paginas);
  return {
    orcamentoId: orcamento.id,
    telefoneCliente: orcamento.contato?.telefone ?? null,
    orcamento: vm,
    paginas: guardadas ?? apresentacaoPadrao(vm),
    salva: guardadas !== null,
    imagens: imagens satisfies ImagemApresentacaoVM[],
  };
}

export async function salvarApresentacao(orcamentoId: string, bruto: unknown): Promise<PaginaApresentacao[]> {
  const paginas = normalizarPaginas(bruto);
  if (!paginas) throw new Error("Apresentação sem nenhuma página.");
  // Só imagens deste orçamento.
  const validas = new Set(
    (await prisma.apresentacaoImagem.findMany({ where: { orcamentoId, id: { in: imagensUsadas(paginas) } }, select: { id: true } })).map((i) => i.id),
  );
  const limpas = imagensUsadas(paginas).reduce((acc, id) => (validas.has(id) ? acc : semImagem(acc, id)), paginas);
  const json = limpas as unknown as Prisma.InputJsonValue;
  await prisma.apresentacaoOrcamento.upsert({
    where: { orcamentoId },
    create: { orcamentoId, paginas: json },
    update: { paginas: json },
  });
  return limpas;
}

/** Volta pra apresentação padrão (as imagens enviadas continuam guardadas). */
export async function recomecarApresentacao(orcamentoId: string): Promise<void> {
  await prisma.apresentacaoOrcamento.deleteMany({ where: { orcamentoId } });
}

const LADO_MAXIMO = 2400;

export async function guardarImagemApresentacao(orcamentoId: string, arquivo: Buffer, nome: string | null): Promise<ImagemApresentacaoVM> {
  const quantas = await prisma.apresentacaoImagem.count({ where: { orcamentoId } });
  if (quantas >= MAX_IMAGENS_ORCAMENTO) throw new Error(`No máximo ${MAX_IMAGENS_ORCAMENTO} imagens por apresentação — exclua alguma antes.`);

  const jpeg = await sharp(arquivo)
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize(LADO_MAXIMO, LADO_MAXIMO, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 86 })
    .toBuffer({ resolveWithObject: true })
    .catch(() => null);
  if (!jpeg) throw new Error("Não consegui abrir essa imagem — mande em JPG ou PNG.");
  return prisma.apresentacaoImagem.create({
    data: { orcamentoId, nome: nome?.slice(0, 120) || null, mime: "image/jpeg", bytes: new Uint8Array(jpeg.data), largura: jpeg.info.width, altura: jpeg.info.height },
    select: { id: true, nome: true, largura: true, altura: true },
  });
}

/** Exclui a imagem e tira ela das páginas guardadas. */
export async function excluirImagemApresentacao(orcamentoId: string, imagemId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.apresentacaoImagem.deleteMany({ where: { id: imagemId, orcamentoId } });
    const guardada = await tx.apresentacaoOrcamento.findUnique({ where: { orcamentoId }, select: { paginas: true } });
    const paginas = normalizarPaginas(guardada?.paginas);
    if (paginas && imagensUsadas(paginas).includes(imagemId)) {
      await tx.apresentacaoOrcamento.update({ where: { orcamentoId }, data: { paginas: semImagem(paginas, imagemId) as unknown as Prisma.InputJsonValue } });
    }
  });
}

export async function bytesDaImagemApresentacao(imagemId: string) {
  return prisma.apresentacaoImagem.findUnique({ where: { id: imagemId }, select: { bytes: true, mime: true } });
}

export async function gerarPdfApresentacao(orcamentoId: string): Promise<{ buffer: Buffer; nomeArquivo: string }> {
  const orcamento = await buscarOrcamento(orcamentoId);
  if (!orcamento) throw new Error("Orçamento não encontrado.");
  const vm = paraApresentacao(orcamento);
  const paginas = paginasDoCliente(normalizarPaginas(orcamento.apresentacao?.paginas) ?? apresentacaoPadrao(vm)).map((p) => resolverPagina(p, vm));
  if (paginas.length === 0) throw new Error("Nenhuma página marcada para ir ao cliente.");

  const ids = imagensUsadas(paginas);
  const enviadas = ids.length
    ? await prisma.apresentacaoImagem.findMany({ where: { orcamentoId, id: { in: ids } }, select: { id: true, bytes: true } })
    : [];
  const imagens = new Map(enviadas.map((i) => [i.id, Buffer.from(i.bytes)]));

  // Foto do produto só dos itens que aparecem numa página de modelo sem imagem escolhida.
  const itensComFoto = [...new Set(paginas.flatMap((p) => (p.tipo === "modelo" && p.imagens.length === 0 ? [p.item] : [])))].filter((i) => orcamento.itens[i]?.produtoId);
  const produtos = itensComFoto.length
    ? await prisma.produto.findMany({
        where: { id: { in: itensComFoto.map((i) => orcamento.itens[i].produtoId as string) } },
        select: { id: true, imagemBytes: true, imagemUrl: true },
      })
    : [];
  const fotosProduto = new Map(await Promise.all(produtos.map(async (p) => [p.id, await carregarFotoProduto(p)] as const)));
  const fotoDoItem = (indice: number) => {
    const produtoId = orcamento.itens[indice]?.produtoId;
    return produtoId ? (fotosProduto.get(produtoId) ?? null) : null;
  };

  // Import aqui: o react-pdf (e as fontes) só carregam quando um PDF é pedido.
  const { NITIDEZ_LEVE, prepararPaginas, renderizarApresentacao } = await import("@/lib/server/pdf/apresentacao-pdf");
  let buffer = await renderizarApresentacao(await prepararPaginas(paginas, imagens, fotoDoItem), vm);
  // A Vercel não devolve resposta maior que 4,5 MB: com muitas fotos, refaz com elas mais leves.
  if (buffer.length > LIMITE_PDF) buffer = await renderizarApresentacao(await prepararPaginas(paginas, imagens, fotoDoItem, NITIDEZ_LEVE), vm);
  if (buffer.length > LIMITE_PDF) throw new Error("A apresentação ficou grande demais — tire algumas fotos ou páginas.");
  return { buffer, nomeArquivo: nomeArquivoApresentacao(vm.numero) };
}

const LIMITE_PDF = 4.2 * 1024 * 1024;
