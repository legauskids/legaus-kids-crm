"use server";

import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import {
  excluirImagemApresentacao,
  guardarImagemApresentacao,
  recomecarApresentacao,
  salvarApresentacao,
} from "@/lib/server/apresentacao";
import { encontrarOuCriarConversaPorTelefone, registrarMensagem } from "@/lib/server/conversas";
import { URL_BASE } from "@/lib/constants/app";
import {
  nomeArquivoApresentacao,
  textoEnvioApresentacaoWhatsApp,
  type ImagemApresentacaoVM,
  type PaginaApresentacao,
} from "@/lib/utils/apresentacao";

const caminho = (orcamentoId: string) => `/orcamentos/${orcamentoId}/apresentacao`;
const mensagemDeErro = (e: unknown, padrao: string) => (e instanceof Error && e.message ? e.message : padrao);

export async function salvarApresentacaoAction(orcamentoId: string, paginas: PaginaApresentacao[]): Promise<{ ok: true } | { error: string }> {
  await requireModulo("orcamentos");
  try {
    await salvarApresentacao(orcamentoId, paginas);
    return { ok: true };
  } catch (e) {
    return { error: mensagemDeErro(e, "Não consegui salvar a apresentação.") };
  }
}

export async function recomecarApresentacaoAction(orcamentoId: string): Promise<void> {
  await requireModulo("orcamentos");
  await recomecarApresentacao(orcamentoId);
  revalidatePath(caminho(orcamentoId));
}

export async function enviarImagemApresentacaoAction(orcamentoId: string, form: FormData): Promise<{ imagem: ImagemApresentacaoVM } | { error: string }> {
  await requireModulo("orcamentos");
  const arquivo = form.get("imagem");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { error: "Escolha uma imagem." };
  try {
    const imagem = await guardarImagemApresentacao(orcamentoId, Buffer.from(await arquivo.arrayBuffer()), arquivo.name || null);
    return { imagem };
  } catch (e) {
    return { error: mensagemDeErro(e, "Não consegui guardar a imagem.") };
  }
}

export async function excluirImagemApresentacaoAction(orcamentoId: string, imagemId: string): Promise<void> {
  await requireModulo("orcamentos");
  await excluirImagemApresentacao(orcamentoId, imagemId);
}

/** Manda o PDF da apresentação pelo WhatsApp (mesma fila do PDF do orçamento). */
export async function enviarApresentacaoWhatsAppAction(orcamentoId: string, telefoneDestino: string): Promise<{ ok: true } | { error: string }> {
  await requireModulo("orcamentos");
  const telefone = telefoneDestino.replace(/\D/g, "");
  if (telefone.length < 10) return { error: "Telefone inválido." };

  const orcamento = await prisma.orcamento.findUnique({ where: { id: orcamentoId }, select: { id: true, numero: true, contato: { select: { nome: true } } } });
  if (!orcamento) return { error: "Orçamento não encontrado." };

  try {
    const conversa = await encontrarOuCriarConversaPorTelefone({ telefone, nomeContato: orcamento.contato?.nome });
    await registrarMensagem({
      conversaId: conversa.id,
      texto: textoEnvioApresentacaoWhatsApp(orcamento.numero),
      direcao: "SAIDA",
      origem: "SISTEMA",
      anexoUrl: `${URL_BASE}/api/pdf/orcamento/${orcamento.id}/apresentacao`,
      anexoNome: nomeArquivoApresentacao(orcamento.numero),
      anexoMimetype: "application/pdf",
    });
  } catch {
    return { error: "Não foi possível enviar pelo WhatsApp agora." };
  }

  revalidatePath("/atendimento");
  return { ok: true };
}
