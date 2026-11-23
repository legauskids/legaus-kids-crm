import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/auth/api-token";
import { agenteLigado } from "@/lib/utils/agente-canal";
import { responderEnquete } from "@/lib/server/despesa-agente";
import { responderEnqueteConta } from "@/lib/server/conta-agente";
import { encontrarOuCriarConversaPorTelefone, registrarMensagem } from "@/lib/server/conversas";

const bodySchema = z.object({
  telefone: z.string().min(8),
  ref: z.string().min(1),
  opcao: z.string().min(1),
});

/**
 * Voto numa enquete mandada pelo CRM (ver Mensagem.enquete), já decifrado e
 * autorizado pelo whatsapp-service (relay-comando-agente.js): despesas
 * ("despesa:<id>": Confirmar / É de um negócio / Descartar), contas a pagar
 * ("conta:<id>", as mesmas opções) e "É o pagamento da conta?"
 * ("pagamento:<contaId>:<despesaId>").
 * Determinístico, sem IA; a resposta entra na fila de envio normal.
 */
export async function POST(request: Request) {
  let usuario;
  try {
    usuario = await requireApiUser(request);
  } catch (unauthorized) {
    return unauthorized as Response;
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Payload inválido" }, { status: 400 });
  }

  const telefone = parsed.data.telefone.replace(/\D/g, "");
  if (!agenteLigado(usuario.canaisAgente, "whatsapp")) return NextResponse.json({ ignorado: true });
  const voto = { identificador: telefone, ref: parsed.data.ref, opcao: parsed.data.opcao };
  const r = (await responderEnquete(voto)) ?? (await responderEnqueteConta(voto));
  if (!r) return NextResponse.json({ ignorado: true });

  await prisma.comandoAgente.create({
    data: {
      origem: "WHATSAPP",
      identificador: telefone,
      usuarioId: usuario.id,
      textoComando: `[enquete] ${parsed.data.opcao}`,
      resposta: r.mensagem,
      status: "CONCLUIDO",
    },
  });
  const conversa = await encontrarOuCriarConversaPorTelefone({ telefone });
  await registrarMensagem({ conversaId: conversa.id, texto: r.mensagem, direcao: "SAIDA", origem: "SISTEMA", enquete: r.enquete });
  return NextResponse.json({ resposta: r.mensagem });
}
