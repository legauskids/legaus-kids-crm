// Mensagem de WhatsApp agendada a partir de uma tarefa (26/10/2026) — regras
// puras. Quem envia é a mesma fila das agendadas do Atendimento.

import { dataHoraDoFormulario } from "./data-hora";

export const LIMITE_TEXTO_MENSAGEM = 4000;
/** Agendar pra "agora" não faz sentido (a fila roda a cada poucos segundos): pelo menos 1 minuto. */
export const ANTECEDENCIA_MINIMA_MS = 60_000;

/** Quem recebe: o contato da própria tarefa, o da conversa de onde ela veio ou o do negócio. */
export function contatoDaTarefa<C>(tarefa: {
  contato?: C | null;
  conversa?: { contato: C } | null;
  negocio?: { contato?: C | null } | null;
}): C | null {
  return tarefa.contato ?? tarefa.conversa?.contato ?? tarefa.negocio?.contato ?? null;
}

/** Texto e horário da mensagem; sem horário escolhido, vai no prazo da tarefa. */
export function validarMensagemDaTarefa(input: {
  texto: string;
  quando: Date | null;
  prazo: Date;
  agora: Date;
}): { texto: string; quando: Date } | { erro: string } {
  const texto = input.texto.trim();
  if (!texto) return { erro: "Escreva a mensagem." };
  if (texto.length > LIMITE_TEXTO_MENSAGEM) return { erro: "Mensagem longa demais (máximo 4.000 caracteres)." };
  const quando = input.quando ?? input.prazo;
  if (isNaN(quando.getTime())) return { erro: "Data/hora da mensagem inválida." };
  if (quando.getTime() < input.agora.getTime() + ANTECEDENCIA_MINIMA_MS) {
    return {
      erro: input.quando
        ? "O horário da mensagem tem que ser daqui a pelo menos 1 minuto."
        : "O prazo da tarefa já passou — escolha quando enviar a mensagem.",
    };
  }
  return { texto, quando };
}

/** Campos de "Agendar mensagem" do formulário de nova tarefa (CamposMensagemNovaTarefa); null = não marcou. */
export function mensagemDoFormulario(
  formData: FormData,
): { texto: string; quando: Date | null; contatoId: string | null } | { erro: string } | null {
  if (formData.get("mensagemAtiva") !== "on") return null;
  const quandoTexto = String(formData.get("mensagemQuando") ?? "").trim();
  let quando: Date | null = null;
  if (quandoTexto) {
    try {
      quando = dataHoraDoFormulario(quandoTexto);
    } catch {
      return { erro: "Data/hora da mensagem inválida." };
    }
  }
  return { texto: String(formData.get("mensagemTexto") ?? ""), quando, contatoId: String(formData.get("mensagemContatoId") ?? "").trim() || null };
}
