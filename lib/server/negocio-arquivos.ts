import "server-only";
import { prisma } from "@/lib/db";
import {
  MAX_ARQUIVOS_POR_ENVIO,
  mimeSeguro,
  nomeArquivoSeguro,
  problemaDoArquivo,
  tamanhoDaParte,
  totalDePartes,
} from "@/lib/utils/negocio-arquivos";

// Arquivos anexados ao negócio (pedido de 2026-11-18). O envio tem 3 passos:
// abrir (registro sem atividade), receber as partes e registrar no histórico,
// que liga os arquivos a uma Atividade ARQUIVO com a nota opcional.

// Envio que ficou pela metade (página fechada no meio) é apagado depois disso.
const ENVIO_ABANDONADO_MS = 6 * 60 * 60 * 1000;

export async function iniciarArquivoNegocio(negocioId: string, meta: { nome: string; mime: string; tamanho: number }) {
  const nome = nomeArquivoSeguro(meta.nome);
  const problema = problemaDoArquivo(meta.tamanho);
  if (problema) throw new Error(`"${nome}" ${problema}.`);
  const negocio = await prisma.negocio.findUnique({ where: { id: negocioId }, select: { id: true } });
  if (!negocio) throw new Error("Negócio não encontrado.");

  await prisma.negocioArquivo.deleteMany({
    where: { atividadeId: null, criadoEm: { lt: new Date(Date.now() - ENVIO_ABANDONADO_MS) } },
  });
  return prisma.negocioArquivo.create({
    data: { negocioId, nome, mime: mimeSeguro(meta.mime), tamanho: meta.tamanho, partesTotal: totalDePartes(meta.tamanho) },
    select: { id: true },
  });
}

export async function guardarParteArquivoNegocio(negocioId: string, arquivoId: string, indice: number, bytes: Buffer) {
  const arquivo = await prisma.negocioArquivo.findUnique({
    where: { id: arquivoId },
    select: { negocioId: true, tamanho: true, atividadeId: true },
  });
  if (!arquivo || arquivo.negocioId !== negocioId || arquivo.atividadeId) {
    throw new Error("Esse envio não está mais aberto — tente de novo.");
  }
  const esperado = tamanhoDaParte(arquivo.tamanho, indice);
  if (esperado === 0 || bytes.length !== esperado) throw new Error("Uma parte do arquivo chegou incompleta — tente de novo.");

  const dados = new Uint8Array(bytes);
  await prisma.negocioArquivoParte.upsert({
    where: { arquivoId_indice: { arquivoId, indice } },
    create: { arquivoId, indice, bytes: dados },
    update: { bytes: dados },
  });
}

/** Liga os arquivos (já com todas as partes) a uma atividade nova no histórico. */
export async function registrarArquivosNegocio(negocioId: string, arquivoIds: string[], texto: string, autorId: string) {
  const ids = [...new Set(arquivoIds)];
  if (ids.length === 0) throw new Error("Escolha um arquivo.");
  if (ids.length > MAX_ARQUIVOS_POR_ENVIO) throw new Error(`No máximo ${MAX_ARQUIVOS_POR_ENVIO} arquivos por vez.`);

  const [arquivos, partes] = await Promise.all([
    prisma.negocioArquivo.findMany({
      where: { id: { in: ids }, negocioId, atividadeId: null },
      select: { id: true, nome: true, partesTotal: true },
    }),
    prisma.negocioArquivoParte.groupBy({ by: ["arquivoId"], where: { arquivoId: { in: ids } }, _count: true }),
  ]);
  if (arquivos.length !== ids.length) throw new Error("Algum arquivo não chegou inteiro — tente de novo.");
  // Cada parte só entra com o tamanho exato do seu índice, então a contagem basta.
  const recebidas = new Map(partes.map((p) => [p.arquivoId, p._count]));
  const incompleto = arquivos.find((a) => recebidas.get(a.id) !== a.partesTotal);
  if (incompleto) throw new Error(`"${incompleto.nome}" não chegou inteiro — tente de novo.`);

  return prisma.atividade.create({
    data: { negocioId, tipo: "ARQUIVO", texto, autorId, arquivos: { connect: ids.map((id) => ({ id })) } },
    select: { id: true },
  });
}

/** Arquivo já registrado no histórico (envio pela metade não é servido). */
export function getArquivoNegocio(id: string) {
  return prisma.negocioArquivo.findFirst({
    where: { id, atividadeId: { not: null } },
    select: { nome: true, mime: true, tamanho: true, partesTotal: true },
  });
}

export async function lerParteArquivoNegocio(arquivoId: string, indice: number) {
  const parte = await prisma.negocioArquivoParte.findUnique({
    where: { arquivoId_indice: { arquivoId, indice } },
    select: { bytes: true },
  });
  return parte?.bytes ?? null;
}
