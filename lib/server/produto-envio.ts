import "server-only";
import { prisma } from "@/lib/db";
import { URL_BASE } from "@/lib/constants/app";
import { encontrarOuCriarConversaPorTelefone, registrarMensagem } from "@/lib/server/conversas";
import { buscarClientesPorTelefone, buscarClientesSimilar } from "@/lib/server/busca-similar";
import { pareceTelefone, telefoneLegivel, telefonePadraoBR } from "@/lib/utils/telefone";
import { caminhoArquivoProduto, nomeArquivoProduto, textoEnvioProduto, type FormatoEnvioProduto } from "@/lib/utils/produto-envio";

// Envio de um produto do catálogo pelo WhatsApp, em card ou PDF, direto da
// tela de Produtos (pedido do Marcos de 2026-10-14). Entra na fila normal do
// whatsapp-service — número sem WhatsApp não "envia" calado (ver
// lib/server/falha-envio.ts).

export type DestinatarioEnvio = { contatoId: string; nome: string; telefone: string; telefoneFormatado: string };

/** Clientes com telefone pelo nome ou pelo número, pra escolher pra quem mandar. */
export async function buscarDestinatarios(termo: string): Promise<DestinatarioEnvio[]> {
  const t = termo.trim();
  if (t.length < 2) return [];
  const achados = pareceTelefone(t) ? await buscarClientesPorTelefone(t, 6) : await buscarClientesSimilar(t, 8);
  return achados
    .filter((c): c is typeof c & { telefone: string } => Boolean(c.telefone))
    .slice(0, 6)
    .map((c) => ({ contatoId: c.id, nome: c.nome, telefone: c.telefone, telefoneFormatado: telefoneLegivel(c.telefone) }));
}

export async function enviarProdutoPorWhatsApp(input: {
  produtoId: string;
  telefone: string;
  formato: FormatoEnvioProduto;
  ocultarValor: boolean;
  mensagem?: string | null;
  nomeContato?: string | null;
}): Promise<{ telefoneFormatado: string; nome: string }> {
  const produto = await prisma.produto.findUnique({ where: { id: input.produtoId }, select: { id: true, nome: true, valorCentavos: true } });
  if (!produto) throw new Error("Produto não encontrado.");
  const telefone = telefonePadraoBR(input.telefone);
  if (telefone.length < 12) throw new Error("Telefone inválido — informe com DDD.");

  // Contato já cadastrado (até no outro formato, com/sem o 9) é reaproveitado.
  const conversa = await encontrarOuCriarConversaPorTelefone({ telefone, nomeContato: input.nomeContato ?? undefined });
  await registrarMensagem({
    conversaId: conversa.id,
    texto: textoEnvioProduto(produto, input.formato, input.ocultarValor, input.mensagem),
    direcao: "SAIDA",
    origem: "SISTEMA",
    anexoUrl: `${URL_BASE}${caminhoArquivoProduto(produto.id, input.formato, input.ocultarValor)}`,
    anexoNome: nomeArquivoProduto(produto.nome, input.formato),
    anexoMimetype: input.formato === "PDF" ? "application/pdf" : "image/jpeg",
  });
  const contato = await prisma.contato.findUnique({ where: { id: conversa.contatoId }, select: { nome: true, telefone: true } });
  return { telefoneFormatado: telefoneLegivel(contato?.telefone ?? telefone), nome: contato?.nome ?? telefoneLegivel(telefone) };
}
