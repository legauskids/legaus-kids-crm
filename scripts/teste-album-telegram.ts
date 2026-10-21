// Álbum de fotos no Telegram vira post do Marketing (pedido de 2026-10-21):
// simula o Telegram mandando as 4 fotos de um álbum quase juntas (só a
// primeira com a legenda do Marcos), pelo mesmo caminho do webhook
// (processarUpdateTelegram), com a IA de verdade (custa alguns centavos). A
// API do Telegram é interceptada: as fotos vêm do pacote legaus-posts (fora
// do git) e o que o bot mandaria fica anotado. Confere que responde UMA vez,
// cria o post com as 4 fotos, o título e o selo de local, e manda as artes
// no chat. Apaga o post e os registros no fim. Rodar:
// npx tsx --conditions=react-server --env-file=.env scripts/teste-album-telegram.ts
process.env.TELEGRAM_BOT_TOKEN = "123:token-de-teste";
process.env.TELEGRAM_ALLOWED_IDS = "7366553763";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { processarUpdateTelegram } from "@/lib/server/telegram";
import type { DadosArte, ElementoSelo, TextosPostagem } from "@/lib/utils/postagem-arte";

const FOTOS = "docs/referencias/legaus-posts/exemplos/2026-10-16-entrega/fotos";
const arquivos: Record<string, Buffer> = {
  "foto-1": fs.readFileSync(path.join(FOTOS, "r2.jpg")),
  "foto-2": fs.readFileSync(path.join(FOTOS, "r1.jpg")),
  "foto-3": fs.readFileSync(path.join(FOTOS, "f3.jpg")),
  "foto-4": fs.readFileSync(path.join(FOTOS, "r4.jpg")),
};
const mensagens: string[] = [];
let fotosEnviadas = 0;
const original = globalThis.fetch;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url);
  if (!u.startsWith("https://api.telegram.org")) return original(url, init);
  const ok = (result: unknown = {}) => new Response(JSON.stringify({ ok: true, result }));
  if (u.includes("/file/bot")) return new Response(new Uint8Array(arquivos[u.split("/").pop() as string]));
  if (u.endsWith("/getFile")) return ok({ file_path: `fotos/${JSON.parse(String(init?.body)).file_id}` });
  if (u.endsWith("/sendMessage")) mensagens.push(String(JSON.parse(String(init?.body)).text ?? ""));
  if (u.endsWith("/sendPhoto")) fotosEnviadas++;
  return ok({ message_id: 1 });
}) as typeof fetch;

let falhas = 0;
const checar = (c: unknown, m: string) => {
  console.log(`${c ? "ok  " : "FALHOU"} ${m}`);
  if (!c) falhas++;
};
const LEGENDA =
  "Prepare essas imagens para postagem no Instagram e Facebook com o título Entrega de Kidplay, coloque um selo de localização (Bob's Vacaria), melhorar a qualidade das imagens e deixar tudo pronto para postagem no módulo de marketing";

async function main() {
  const marcos = await prisma.user.findFirstOrThrow({ where: { username: "marcos" } });
  const inicio = new Date();
  const base = 970000000 + Math.floor(Math.random() * 100000);
  const grupo = `teste-${base}`;
  const de = { id: 7366553763, first_name: "Marcos" };
  const chat = { id: 7366553763, type: "private" };
  const updates = [1, 2, 3, 4].map((i) => ({
    update_id: base + i,
    message: { message_id: base + i, from: de, chat, media_group_id: grupo, photo: [{ file_id: `foto-${i}`, file_size: 200000 }], ...(i === 1 && { caption: LEGENDA }) },
  }));
  let postId: string | null = null;
  try {
    const t0 = Date.now();
    // Como o Telegram: chegam quase juntas, a da legenda primeiro.
    await Promise.all(updates.map((u, i) => new Promise((ok) => setTimeout(ok, i * 150)).then(() => processarUpdateTelegram(u))));
    const segundos = (Date.now() - t0) / 1000;
    console.log(`     (${segundos.toFixed(1)} s; mensagens do bot: ${mensagens.length}; fotos mandadas no chat: ${fotosEnviadas})`);
    mensagens.forEach((m) => console.log(`     < ${m.replace(/\n/g, " ").slice(0, 400)}`));

    checar(mensagens.length >= 1 && mensagens.length <= 2 && !mensagens.some((m) => /o que (você quer|eu faço)|chegou só a foto/i.test(m)), "respondeu uma vez só, ao pedido da legenda (não uma por foto)");
    checar(segundos < 55, `cabe no tempo do Telegram (${segundos.toFixed(1)} s < 60 s)`);
    const post = await prisma.postagem.findFirst({
      where: { criadoPorId: marcos.id, criadoEm: { gte: inicio } },
      orderBy: { criadoEm: "desc" },
      select: { id: true, numero: true, status: true, legenda: true, textos: true, _count: { select: { imagens: true } }, artes: { orderBy: { ordem: "asc" }, select: { dados: true, formato: true } } },
    });
    postId = post?.id ?? null;
    checar(post && post._count.imagens === 4, `post criado com as 4 fotos do álbum (${post?._count.imagens ?? 0})`);
    const textos = post?.textos as TextosPostagem | undefined;
    checar(textos?.titulo[0] === "Entrega de" && /kid ?play/i.test(textos?.titulo[1] ?? "") && /bob/i.test(textos?.local ?? ""), `título e local: ${JSON.stringify(textos?.titulo)} · ${textos?.local}`);
    const selos = ((post?.artes[0]?.dados as unknown as DadosArte | undefined)?.elementos ?? []).filter((e): e is ElementoSelo => e.tipo === "selo");
    checar(selos.some((s) => s.icone === "local" && /bob/i.test(s.t)), "capa com o selo de localização (pino)");
    checar(post?.legenda?.includes("#LegausKids") && post.status === "AGUARDANDO_APROVACAO", "legenda pronta e post aguardando aprovação");
    checar(fotosEnviadas >= 2 && fotosEnviadas <= 4, `artes mandadas no chat (${fotosEnviadas})`);
    const sobrouFoto = await prisma.comandoAgente.count({ where: { externalId: { in: updates.map((u) => `tg:${u.update_id}`) }, anexoImagem: { not: null } } });
    checar(sobrouFoto === 0, "as fotos usadas saíram da memória da conversa");
  } finally {
    if (postId) await prisma.postagem.delete({ where: { id: postId } });
    await prisma.comandoAgente.deleteMany({ where: { externalId: { in: updates.map((u) => `tg:${u.update_id}`) } } });
  }
  console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
