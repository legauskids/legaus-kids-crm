"use server";

import { requireUser } from "@/lib/auth/guards";
import { processarComandoAgente } from "@/lib/server/agente";
import { transcreverAudio, transcricaoConfigurada } from "@/lib/server/transcricao";

export async function enviarComandoAgenteAction(texto: string): Promise<{ resposta: string } | { error: string }> {
  const user = await requireUser();
  if (!texto.trim()) return { error: "Digite um comando." };

  try {
    const resultado = await processarComandoAgente({
      texto: texto.trim(),
      origem: "CRM_TEXTO",
      identificador: `crm:${user.id}`,
      usuarioId: user.id,
    });
    return resultado;
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : "Não consegui processar o comando." };
  }
}

/** Mesmo fluxo do comando por texto, mas a partir de um áudio gravado no navegador (microfone do CRM). */
export async function enviarComandoAudioAction(
  audioBase64: string,
  mimetype: string,
): Promise<{ transcricao: string; resposta: string } | { error: string }> {
  const user = await requireUser();
  if (!transcricaoConfigurada()) {
    return { error: "Transcrição de voz ainda não está configurada no servidor." };
  }

  try {
    const audio = Buffer.from(audioBase64, "base64");
    const texto = await transcreverAudio(audio, mimetype);
    if (!texto) {
      return { error: "Não consegui entender o áudio — tenta falar de novo, mais perto do microfone." };
    }
    const resultado = await processarComandoAgente({
      texto,
      origem: "CRM_TEXTO",
      identificador: `crm:${user.id}`,
      usuarioId: user.id,
    });
    return { transcricao: texto, resposta: resultado.resposta };
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : "Não consegui processar o áudio." };
  }
}
