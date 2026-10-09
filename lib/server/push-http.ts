import "server-only";
import { NextResponse } from "next/server";
import type { ContaBancaria } from "@prisma/client";
import { processarPushBancario, tokenPushConfere } from "@/lib/server/push-bancario";
import { enviarRespostaTelegram } from "@/lib/server/telegram";

/**
 * Notificação de um app de banco encaminhada pelo MacroDroid do celular do
 * Marcos (configuração: comando /push no Telegram). Corpo em texto puro
 * (título + quebra de linha + texto grande da notificação) ou JSON
 * { titulo, texto }. A pergunta vai pro Telegram do Marcos. Usado pelas
 * rotas app/api/push/sicredi e app/api/push/infinitepay.
 */
export async function receberPush(request: Request, conta: ContaBancaria): Promise<Response> {
  if (!tokenPushConfere(request.headers.get("authorization"))) {
    console.warn(`[push] ${conta} recusado: chave inválida.`);
    return NextResponse.json({ error: "Chave inválida." }, { status: 401 });
  }

  const bruto = (await request.text()).slice(0, 4000);
  let titulo: string | null = null;
  let texto = bruto;
  if ((request.headers.get("content-type") ?? "").includes("json")) {
    try {
      const j = JSON.parse(bruto) as Record<string, unknown>;
      const campo = (...nomes: string[]) => nomes.map((n) => j[n]).find((v): v is string => typeof v === "string") ?? null;
      titulo = campo("titulo", "title");
      texto = campo("texto", "text", "notification") ?? "";
    } catch {
      // JSON quebrado (aspas ou quebra de linha da notificação): lê como texto.
    }
  }
  if (!texto.trim()) return NextResponse.json({ error: "Notificação vazia." }, { status: 400 });

  const r = await processarPushBancario({ conta, titulo, texto });
  if (r.status === "registrado") {
    try {
      await enviarRespostaTelegram(r.chatId, r.resposta);
    } catch (erro) {
      console.error(`[push] aviso ${r.avisoId} registrado, mas não consegui avisar no Telegram: ${erro instanceof Error ? erro.message : erro}`);
    }
  }
  return NextResponse.json({ status: r.status });
}
