"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModulo } from "@/lib/auth/guards";
import { guardarParteArquivoNegocio, iniciarArquivoNegocio, registrarArquivosNegocio } from "@/lib/server/negocio-arquivos";

// Arquivos anexados ao negócio (historico-tab.tsx): o navegador abre o envio,
// manda as partes de 3 MB e, com tudo recebido, registra no histórico.

const mensagemDeErro = (e: unknown, padrao: string) => (e instanceof Error && e.message ? e.message : padrao);

const metaSchema = z.object({ nome: z.string().max(1000), mime: z.string().max(255), tamanho: z.number().int() });

export async function iniciarArquivoNegocioAction(negocioId: string, meta: { nome: string; mime: string; tamanho: number }): Promise<{ id: string } | { error: string }> {
  await requireModulo("negocios");
  const parsed = metaSchema.safeParse(meta);
  if (!parsed.success) return { error: "Arquivo inválido." };
  try {
    return await iniciarArquivoNegocio(negocioId, parsed.data);
  } catch (e) {
    return { error: mensagemDeErro(e, "Não consegui começar o envio do arquivo.") };
  }
}

export async function enviarParteArquivoNegocioAction(negocioId: string, arquivoId: string, indice: number, form: FormData): Promise<{ ok: true } | { error: string }> {
  await requireModulo("negocios");
  const parte = form.get("parte");
  if (!(parte instanceof Blob)) return { error: "Uma parte do arquivo não chegou — tente de novo." };
  try {
    await guardarParteArquivoNegocio(negocioId, arquivoId, indice, Buffer.from(await parte.arrayBuffer()));
    return { ok: true };
  } catch (e) {
    return { error: mensagemDeErro(e, "Não consegui guardar o arquivo.") };
  }
}

export async function registrarArquivosNegocioAction(negocioId: string, arquivoIds: string[], texto: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireModulo("negocios");
  try {
    await registrarArquivosNegocio(negocioId, arquivoIds, texto.trim(), user.id);
  } catch (e) {
    return { error: mensagemDeErro(e, "Não consegui registrar os arquivos no histórico.") };
  }
  revalidatePath(`/negocios/${negocioId}`);
  return { ok: true };
}
