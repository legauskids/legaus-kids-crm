import { z } from "zod";

export const criarContatoSchema = z.object({
  nome: z.string().min(1, "Informe um nome"),
  telefone: z.string().min(8, "Informe um telefone válido"),
  empresa: z.string().optional(),
});

export const atualizarContatoSchema = z.object({
  contatoId: z.string().min(1),
  nome: z.string().min(1, "Informe um nome"),
  empresa: z.string().optional(),
  tags: z.string().optional(),
});
