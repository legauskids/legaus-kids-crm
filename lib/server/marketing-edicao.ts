import "server-only";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { editarFotosComIA } from "@/lib/server/marketing";
import { destinatarioDosAvisos } from "@/lib/server/push-bancario";
import type { ArquivoParaEnviar } from "@/lib/server/agente-arquivos";

// Edição de foto por IA em segundo plano (26/10/2026): leva ~1 min por foto,
// mais que o assistente pode esperar. Começa depois da resposta (after) e,
// quando termina, avisa no Telegram de quem pediu, com as artes refeitas.

/** Só o Marcos (administrador) pede edição de foto por IA ("somente quando solicitado por mim"). */
export async function podeEditarFotoComIA(usuarioId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: usuarioId }, select: { isAdmin: true } });
  return Boolean(u?.isAdmin);
}

export function editarFotosEmSegundoPlano(input: { postagemId: string; imagemIds: string[]; instrucao: string; usuarioId: string }): void {
  after(async () => {
    let r: Awaited<ReturnType<typeof editarFotosComIA>>;
    try {
      r = await editarFotosComIA(input);
    } catch (erro) {
      r = { editadas: [], falhas: [erro instanceof Error ? erro.message : "falha desconhecida"], artes: [] };
    }
    await avisarFimDaEdicao(input, r).catch((erro) => console.error(`[marketing] aviso da edição por IA: ${erro instanceof Error ? erro.message : erro}`));
  });
}

async function avisarFimDaEdicao(
  input: { postagemId: string; instrucao: string; usuarioId: string },
  r: { editadas: number[]; falhas: string[]; artes: string[] },
): Promise<void> {
  const [post, usuario] = await Promise.all([
    prisma.postagem.findUnique({ where: { id: input.postagemId }, select: { numero: true, artes: { orderBy: { ordem: "asc" }, select: { id: true, formato: true } } } }),
    prisma.user.findUnique({ where: { id: input.usuarioId }, select: { telegramId: true } }),
  ]);
  const chat = usuario?.telegramId ?? (await destinatarioDosAvisos())?.telegramId;
  if (!post || !chat) return;
  const fotos = (n: number[]) => (n.length === 1 ? `a foto ${n[0]}` : `as fotos ${n.join(", ")}`);
  const mensagem = r.editadas.length
    ? `🪄 Post #${post.numero}: editei com IA ${fotos(r.editadas)} ("${input.instrucao.trim()}"). As artes com ${r.editadas.length === 1 ? "ela" : "elas"} foram refeitas — confira e aprove no CRM. Não gostou? É só pedir "volta ${fotos(r.editadas)} ao original".${r.falhas.length ? `\n⚠️ Não consegui: ${r.falhas.join("; ")}` : ""}`
    : `⚠️ Post #${post.numero}: não consegui editar as fotos — ${r.falhas.join("; ") || "nenhuma foto encontrada"}.`;
  const mudaram = post.artes.filter((a) => r.artes.includes(a.id));
  const previa = [...mudaram.filter((a) => a.formato !== "STORY").slice(0, 3), ...mudaram.filter((a) => a.formato === "STORY").slice(0, 1)];
  const arquivos: ArquivoParaEnviar[] = previa.map((a) => ({ tipo: "arte-post", arteId: a.id }));
  // Import tardio: o telegram.ts importa o agente, que importa o Marketing.
  const { enviarRespostaTelegram } = await import("@/lib/server/telegram");
  await enviarRespostaTelegram(chat, { mensagem, arquivos });
}
