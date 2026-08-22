import { z } from "zod";

export const criarTarefaSchema = z.object({
  titulo: z.string().min(1, "Informe um título"),
  negocioId: z.string().optional(),
  responsavelId: z.string().min(1, "Selecione um responsável"),
  prazo: z.string().min(1, "Informe o prazo"),
  status: z.enum(["A_FAZER", "EM_ANDAMENTO", "APROVACAO", "CONCLUIDA"]).default("A_FAZER"),
  descricao: z.string().optional(),
});
