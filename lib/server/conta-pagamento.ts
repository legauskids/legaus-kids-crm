import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { marcarContaPaga } from "@/lib/server/contas-pagar";
import { diaBrasilia, inicioDoDiaBrasilia, somarDias } from "@/lib/utils/brasilia";
import { DIAS_PARA_LIGAR_DESPESA, dataBR } from "@/lib/utils/contas-pagar";
import { canalDoIdentificador, type Botoes } from "@/lib/utils/agente-canal";
import { botoesDePagamento, enqueteDePagamento, perguntaDePagamento, type ContaParaPagamento } from "@/lib/utils/conta-agente";
import type { Enquete } from "@/lib/utils/despesa-agente";

// "Paguei" e push do banco × contas a pagar (pedido de 2026-11-23): a despesa
// com o valor de uma conta aberta (vencimento até 5 dias antes ou depois)
// ganha a pergunta "É o pagamento da conta X?" — nunca liga sozinha. Fica
// fora de conta-agente.ts para a despesa-agente.ts poder usar sem import
// circular.

/** A conta aberta de mesmo valor com o vencimento mais perto do dia do pagamento. */
export async function contaParaPagamento(valorCentavos: number, dia: string): Promise<ContaParaPagamento | null> {
  if (valorCentavos <= 0) return null;
  const contas = await prisma.contaPagar.findMany({
    where: {
      status: "ABERTA",
      valorCentavos,
      vencimento: {
        gte: inicioDoDiaBrasilia(somarDias(dia, -DIAS_PARA_LIGAR_DESPESA)),
        lt: inicioDoDiaBrasilia(somarDias(dia, DIAS_PARA_LIGAR_DESPESA + 1)),
      },
    },
    select: { id: true, fornecedor: true, valorCentavos: true, vencimento: true, parcela: true, totalParcelas: true },
  });
  const perto = (c: { vencimento: Date }) => Math.abs(c.vencimento.getTime() - Date.parse(`${dia}T12:00:00-03:00`));
  const escolhida = contas.sort((a, b) => perto(a) - perto(b))[0];
  return escolhida ? { ...escolhida, vencimento: diaBrasilia(escolhida.vencimento) } : null;
}

export type PerguntaPagamento = { mensagem: string; enquete?: Enquete; botoes?: Botoes };

/** A pergunta para esta despesa (enquete no WhatsApp, botões no Telegram), ou null se não há conta que combine. */
export async function perguntarPagamentoDaDespesa(despesaId: string, identificador: string): Promise<PerguntaPagamento | null> {
  const despesa = await prisma.despesa.findUnique({
    where: { id: despesaId },
    select: { valorCentavos: true, data: true, contaPagar: { select: { id: true } } },
  });
  if (!despesa || despesa.contaPagar) return null;
  const conta = await contaParaPagamento(despesa.valorCentavos, diaBrasilia(despesa.data));
  if (!conta) return null;
  const canal = canalDoIdentificador(identificador);
  return {
    mensagem: perguntaDePagamento(conta) + (canal === "crm" ? " Se for, marque como paga em Financeiro → Contas a pagar." : ""),
    enquete: canal === "whatsapp" ? enqueteDePagamento(conta, despesaId) : undefined,
    botoes: canal === "telegram" ? botoesDePagamento(conta.id, despesaId) : undefined,
  };
}

function reais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");
}

/**
 * "É essa conta": a despesa vira o pagamento da conta. Rascunho (o push do
 * banco) é confirmado com a categoria e o centro da conta, que são os certos.
 * null = a despesa não é desta conversa.
 */
export async function vincularPagamento(contaId: string, despesaId: string, identificador: string): Promise<{ mensagem: string } | null> {
  const despesa = await prisma.despesa.findUnique({
    where: { id: despesaId },
    select: { id: true, status: true, data: true, valorCentavos: true, telefoneOrigem: true, registradaPorId: true, extracao: true, contaPagar: { select: { id: true } } },
  });
  if (!despesa) return { mensagem: "Essa despesa não existe mais (já tinha sido descartada)." };
  if (despesa.telefoneOrigem !== identificador) return null;
  if (despesa.contaPagar?.id === contaId) return { mensagem: "Já está ligada a essa conta 👍" };
  const conta = await prisma.contaPagar.findUnique({
    where: { id: contaId },
    select: { status: true, fornecedor: true, vencimento: true, categoriaId: true, centroGeralId: true, negocioId: true },
  });
  if (!conta || conta.status === "CANCELADA") return { mensagem: "Essa conta não existe mais." };
  if (conta.status === "PAGA") return { mensagem: `A conta *${conta.fornecedor}* já estava paga — não liguei de novo.` };

  if (despesa.status === "A_CONFIRMAR") {
    const log = (despesa.extracao ?? {}) as Prisma.JsonObject;
    await prisma.despesa.update({
      where: { id: despesa.id },
      data: {
        ...(conta.categoriaId ? { categoriaId: conta.categoriaId } : {}),
        ...(conta.centroGeralId || conta.negocioId ? { centroGeralId: conta.centroGeralId, negocioId: conta.negocioId } : {}),
        status: "AGUARDANDO_CONCILIACAO",
        confirmadaEm: new Date(),
        extracao: { ...log, contaPagarId: contaId } as Prisma.InputJsonValue,
      },
    });
  }
  try {
    await marcarContaPaga(contaId, { dia: diaBrasilia(despesa.data), valorCentavos: despesa.valorCentavos, despesaId: despesa.id }, despesa.registradaPorId);
  } catch (erro) {
    return { mensagem: `Não consegui ligar: ${erro instanceof Error ? erro.message : "erro desconhecido"}` };
  }
  return {
    mensagem: `✅ Conta *${conta.fornecedor}* (vencimento ${dataBR(diaBrasilia(conta.vencimento))}) marcada como paga com esse pagamento de *${reais(despesa.valorCentavos)}*. A despesa fica aguardando o extrato.`,
  };
}
