import { z } from "zod";

export const criarNegocioSchema = z.object({
  titulo: z.string().min(1, "Informe um título"),
  contatoId: z.string().min(1, "Selecione um contato"),
  funilId: z.string().min(1),
  etapaId: z.string().min(1),
  valorReais: z.coerce.number().min(0).default(0),
  responsavelId: z.string().min(1, "Selecione um responsável"),
  previsaoFechamento: z.string().optional(),
  origem: z.string().optional(),
});

export const marcarPerdidoSchema = z.object({
  negocioId: z.string().min(1),
  motivo: z.string().min(1, "Informe o motivo da perda"),
});

export const atualizarDadosNegocioSchema = z.object({
  negocioId: z.string().min(1),
  valorReais: z.coerce.number().min(0).optional(),
  previsaoFechamento: z.string().optional(),
  origem: z.string().optional(),
  progressoProducao: z.coerce.number().min(0).max(100).optional(),
  previsaoProducao: z.string().optional(),
  dataInstalacao: z.string().optional(),
  equipeInstalacao: z.string().optional(),
});
