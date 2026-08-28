import { z } from "zod";

export const criarProdutoSchema = z.object({
  nome: z.string().min(1, "Informe um nome"),
  codigo: z.string().optional(),
  categoria: z.string().min(1, "Informe uma categoria"),
  descricao: z.string().optional(),
  valorReais: z.coerce.number().min(0).optional(),
});
