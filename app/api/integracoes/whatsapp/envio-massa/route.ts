import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api-token";
import { encontrarOuCriarConversaPorTelefone, registrarMensagem } from "@/lib/server/conversas";

const bodySchema = z.object({
  numeros: z.array(z.string().min(1)).min(1),
  texto: z.string().min(1),
});

/**
 * Cria uma Mensagem SAIDA pendente (sem externalId) por número — o mesmo
 * mecanismo usado pelo composer do Atendimento pra mandar uma mensagem
 * avulsa. Não envia nada diretamente: essas mensagens caem na fila normal
 * (GET fila-envio) e são retransmitidas pelo alarme de 1 min do
 * background.js da extensão, uma de cada vez, reaproveitando o mesmo
 * fluxo (com o mesmo retry em caso de precisar navegar antes) já usado
 * pra mensagens agendadas.
 */
export async function POST(request: Request) {
  try {
    await requireApiUser(request);
  } catch (unauthorized) {
    return unauthorized as Response;
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Payload inválido" }, { status: 400 });
  }

  let criadas = 0;
  for (const numero of parsed.data.numeros) {
    const conversa = await encontrarOuCriarConversaPorTelefone({ telefone: numero });
    await registrarMensagem({ conversaId: conversa.id, texto: parsed.data.texto, direcao: "SAIDA", origem: "MANUAL" });
    criadas++;
  }

  return NextResponse.json({ ok: true, criadas });
}
