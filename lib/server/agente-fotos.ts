import "server-only";
import sharp from "sharp";
import { prisma } from "@/lib/db";

// Foto recente da conversa com o agente (pedido do Marcos de 2026-10-13).
// Antes, a foto só valia na MESMA mensagem do pedido: foto mandada antes do
// texto, ou seguida de um "sim", se perdia e o agente pedia pra reenviar (8
// vezes numa tarde). Agora a foto de cada mensagem que não foi usada fica
// guardada no ComandoAgente dela por 30 minutos; ao ser usada, sai daqui.

export const JANELA_FOTO_MS = 30 * 60 * 1000;
/** Fotos não usadas somem do banco depois disso (só a cópia da conversa — a do produto fica). */
const GUARDA_MAXIMA_MS = 24 * 60 * 60 * 1000;

/** Guarda a foto da mensagem (reduzida) no registro dela e limpa as velhas de qualquer conversa. */
export async function guardarFotoDaConversa(comandoId: string, foto: Buffer): Promise<void> {
  let reduzida: Buffer;
  try {
    reduzida = await sharp(foto).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  } catch {
    return; // não é imagem que dê pra ler: não guarda
  }
  await prisma.comandoAgente.update({ where: { id: comandoId }, data: { anexoImagem: new Uint8Array(reduzida), anexoImagemMime: "image/jpeg" } });
  await prisma.comandoAgente.updateMany({
    where: { anexoImagem: { not: null }, criadoEm: { lt: new Date(Date.now() - GUARDA_MAXIMA_MS) } },
    data: { anexoImagem: null, anexoImagemMime: null },
  });
}

/** Fotos ainda não usadas desta conversa nos últimos 30 min, da mais recente pra mais antiga. */
export async function fotosRecentesDaConversa(identificador: string, limite = 3) {
  const linhas = await prisma.comandoAgente.findMany({
    where: { identificador, anexoImagem: { not: null }, criadoEm: { gte: new Date(Date.now() - JANELA_FOTO_MS) } },
    orderBy: { criadoEm: "desc" },
    take: limite,
    select: { id: true, criadoEm: true, anexoImagem: true },
  });
  return linhas.map((l) => ({ comandoId: l.id, recebidaEm: l.criadoEm, bytes: Buffer.from(l.anexoImagem as Uint8Array) }));
}

/** A foto foi usada (ex.: virou a foto de um produto): sai da memória da conversa. */
export async function esquecerFotoDaConversa(comandoId: string): Promise<void> {
  await prisma.comandoAgente.update({ where: { id: comandoId }, data: { anexoImagem: null, anexoImagemMime: null } });
}
