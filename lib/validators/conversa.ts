import { z } from "zod";

export const enviarMensagemSchema = z.object({
  conversaId: z.string().min(1),
  texto: z.string().min(1),
});

export const criarNotaSchema = z.object({
  conversaId: z.string().min(1),
  texto: z.string().min(1),
});

export const criarAgendadaSchema = z.object({
  conversaId: z.string().min(1),
  texto: z.string().min(1, "Escreva a mensagem"),
  agendadaPara: z.string().min(1, "Informe data e hora"),
});

export const transferirSchema = z.object({
  conversaId: z.string().min(1),
  setorId: z.string().optional(),
  atendenteId: z.string().optional(),
});

export const negocioMiniFormSchema = z.object({
  conversaId: z.string().min(1),
  contatoId: z.string().min(1),
  titulo: z.string().min(1, "Informe um título"),
  produto: z.string().optional(),
  descricao: z.string().optional(),
  funilId: z.string().min(1),
  etapaId: z.string().min(1),
  valorReais: z.coerce.number().min(0).default(0),
  responsavelId: z.string().min(1, "Selecione um responsável"),
  previsaoFechamento: z.string().optional(),
  origem: z.string().optional(),
  criarTarefa: z.coerce.boolean().default(false),
  tarefaTitulo: z.string().optional(),
  tarefaPrazo: z.string().optional(),
  tarefaResponsavelId: z.string().optional(),
  tarefaDescricao: z.string().optional(),
});

export const tarefaMiniFormSchema = z.object({
  conversaId: z.string().min(1),
  contatoId: z.string().min(1),
  titulo: z.string().min(1, "Informe um título"),
  responsavelId: z.string().min(1, "Selecione um responsável"),
  prazo: z.string().min(1, "Informe o prazo"),
  descricao: z.string().optional(),
});

export const moverMiniFormSchema = z.object({
  negocioId: z.string().min(1, "Selecione um negócio"),
  etapaId: z.string().min(1, "Selecione uma etapa"),
});
