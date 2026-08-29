"use server";

import { requireUser } from "@/lib/auth/guards";
import { processarComandoAgente } from "@/lib/server/agente";

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
